// STOCX player trade+record builder.
// No keypairs are read. No signatures are made. No transactions are sent.
// It builds the unsigned buy_v2 + record_activity transaction for a player
// wallet so the browser/API layer can hand it to Phantom/Solflare.
const http = require("http");

function incognitoHeaders() {
  return {
    accept: "application/json",
    "user-agent": "stocx-player-builder/0.1",
  };
}

const BN = require("bn.js");
const {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} = require("@solana/web3.js");
const {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  unpackAccount,
  unpackMint,
} = require("@solana/spl-token");
const {
  bondingCurvePda,
  computeFeesBps,
  feeSharingConfigPda,
  getBuySolAmountFromTokenAmount,
  normalizeQuoteMint,
  OnlinePumpSdk,
  PUMP_FEE_PROGRAM_ID,
  PUMP_PROGRAM_ID,
  PUMP_SDK,
  quoteAta,
} = require("@pump-fun/pump-sdk");

const RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const MAX_PACKET_BYTES = 1232;
const MAX_U64 = BigInt("18446744073709551615");
const SITE_URL = "https://stocx.ratchetx.xyz";
const PROGRAM_ID = new PublicKey("GPYNqnB9h5PnsmajMYkhCSDrfQiXmgePR57QFwuG6eDH");
const STOCX_MINT = new PublicKey("4NseDVjR15RQJyMpquqRVdEWoWFMrjb4pnyXbhYy1tHE");
const TSLAX_MINT = new PublicKey("XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB");
const SEMIR_WALLET = new PublicKey("HXFDaHyZ3i477z1BakiTWZg9UQN8rcreruuv9ifC1HvM");
const DEFAULT_ALT = new PublicKey("FfP2CFWniyUraM4g3vncRPfYQnFZ3HTTShHXsfSJGSJG");
const DEFAULT_BASE_AMOUNT_RAW = "1000000000000";
const DEFAULT_SLIPPAGE_BPS = 100;
const DEFAULT_SIDE = 0;
const DEFAULT_PORT = 8798;
const RATE_LIMIT_WINDOW_MS = Number(process.env.STOCX_RATE_LIMIT_WINDOW_MS || 60000);
const RATE_LIMIT_MAX = Number(process.env.STOCX_RATE_LIMIT_MAX || 30);
const DEFAULT_ALLOWED_ORIGINS = [
  "*",
  "https://stocx.ratchetx.xyz",
  "http://127.0.0.1:8787",
  "http://localhost:8787",
];
const ALLOWED_ORIGINS = new Set(
  (process.env.STOCX_ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);
const POT_SHARE_BPS = new BN(6633);
const ETUDE_ACTIVITY_SEED = Buffer.from("etude_activity");
const ETUDE_CONFIG_SEED = Buffer.from("etude_config");
const ETUDE_POT_SEED = Buffer.from("etude_pot");
const PUMP_BUYBACK_FEE_RECIPIENT = new PublicKey("5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD");

function usage() {
  console.log(`Usage:
  node stocx_player_trade_record_builder.js measure --user <pubkey> [--alt <lookup-table>]
  node stocx_player_trade_record_builder.js build --user <pubkey> [--alt <lookup-table>]
  node stocx_player_trade_record_builder.js serve [--alt <lookup-table>] [--port 8798]

Options:
  --base-amount <raw>      Default ${DEFAULT_BASE_AMOUNT_RAW} raw STOCX.
  --slippage-bps <bps>     Default ${DEFAULT_SLIPPAGE_BPS}.
  --side <0|1>             Default ${DEFAULT_SIDE}; alternating side earns the flip reward after cooldown.
  --include-base-ata <mode>  always | auto | never. Default always.

All modes are no-keypair. "build" returns an unsigned v0 transaction for a wallet to sign.
`);
}

function argValue(name, fallback = null, argv = process.argv) {
  const i = argv.indexOf(name);
  if (i === -1) return fallback;
  const value = argv[i + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return value;
}

function intArg(name, fallback, argv = process.argv) {
  const raw = argValue(name, null, argv);
  if (raw === null) return fallback;
  if (!/^[0-9]+$/.test(raw)) throw new Error(`${name} must be an unsigned integer`);
  return Number(raw);
}

function u64Arg(name, fallback, argv = process.argv) {
  const raw = argValue(name, fallback, argv);
  if (!/^[0-9]+$/.test(raw)) throw new Error(`${name} must be an unsigned integer`);
  const value = new BN(raw);
  if (value.isZero()) throw new Error(`${name} must be nonzero`);
  return value;
}

function pubkeyArg(name, fallback = null, argv = process.argv) {
  const raw = argValue(name, fallback, argv);
  if (!raw) return null;
  return new PublicKey(raw);
}

function makeConnection() {
  return new Connection(RPC, {
    commitment: "confirmed",
    fetchMiddleware: (url, options, fetch) => fetch(url, {
      ...options,
      headers: {
        ...incognitoHeaders(url, { vrsta: "json" }),
        ...(options.headers || {}),
      },
    }),
  });
}

async function retry(label, fn) {
  let lastError = null;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = String(err.message || err);
      const transient = msg.includes("429")
        || msg.includes("503")
        || msg.includes("Too Many Requests")
        || msg.includes("Service unavailable");
      if (attempt < 6) {
        const delayMs = transient ? 1000 * (2 ** (attempt - 1)) : 400 * attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw new Error(`${label} failed after 6 attempts: ${lastError.message || lastError}`);
}

function pda(seeds, programId) {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

function rawUi(raw, decimals) {
  const value = BigInt(raw.toString());
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const frac = value % scale;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

function addSlippageBps(amount, bps) {
  return amount.add(amount.mul(new BN(bps)).add(new BN(9999)).div(new BN(10000)));
}

function ceilDiv(a, b) {
  return a.add(b.subn(1)).div(b);
}

function readU64(data, offset) {
  return data.readBigUInt64LE(offset);
}

function readI64(data, offset) {
  return data.readBigInt64LE(offset);
}

function decodeConfig(info) {
  if (!info || info.data.length < 444) return null;
  const data = info.data;
  const key = (offset) => new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  return {
    isInit: data[0],
    configBump: data[1],
    potBump: data[2],
    mint: key(3),
    quoteMint: key(35),
    creator: key(67),
    baseUnitAmountRaw: readU64(data, 99).toString(),
    activityRewardAmountRaw: readU64(data, 107).toString(),
    rankCounter: data[115],
    minTradeAmountRaw: readU64(data, 436).toString(),
  };
}

function decodeActivity(info) {
  if (!info || info.data.length < 23) return null;
  const data = info.data;
  return {
    isInit: data[0],
    bump: data[1],
    lastTs: readI64(data, 2).toString(),
    lastSide: data[10],
    totalCalls: data.readUInt32LE(11),
    totalEarnedRaw: readU64(data, 15).toString(),
  };
}

function tokenAccountSummary(address, info, tokenProgram, expectedMint, expectedOwner, decimals) {
  if (!info) {
    return {
      exists: false,
      address: address.toBase58(),
      amountRaw: "0",
      amountUi: rawUi(0n, decimals),
      mintMatches: false,
      ownerMatches: false,
    };
  }
  const unpacked = unpackAccount(address, info, tokenProgram);
  return {
    exists: true,
    address: address.toBase58(),
    amountRaw: unpacked.amount.toString(),
    amountUi: rawUi(unpacked.amount, decimals),
    mint: unpacked.mint.toBase58(),
    tokenOwner: unpacked.owner.toBase58(),
    ownerProgram: info.owner.toBase58(),
    dataLength: info.data.length,
    mintMatches: unpacked.mint.equals(expectedMint),
    ownerMatches: unpacked.owner.equals(expectedOwner),
  };
}

function buyCostBreakdown(global, feeConfig, stocxSupply, bondingCurve, amount, quoteMint) {
  const minAmount = BN.min(amount, bondingCurve.realTokenReserves);
  if (minAmount.gte(bondingCurve.virtualTokenReserves)) return null;
  const quoteNoFees = minAmount
    .mul(bondingCurve.virtualQuoteReserves)
    .div(bondingCurve.virtualTokenReserves.sub(minAmount))
    .add(new BN(1));
  const fees = computeFeesBps({
    global,
    feeConfig,
    mintSupply: stocxSupply,
    virtualQuoteReserves: bondingCurve.virtualQuoteReserves,
    virtualTokenReserves: bondingCurve.virtualTokenReserves,
    quoteMint,
    creatorFeeBps: bondingCurve.creatorFeeBps,
  });
  const protocolFee = ceilDiv(quoteNoFees.mul(fees.protocolFeeBps), new BN(10000));
  const creatorFee = ceilDiv(quoteNoFees.mul(fees.creatorFeeBps), new BN(10000));
  return {
    quoteNoFees,
    protocolFee,
    creatorFee,
    totalCost: quoteNoFees.add(protocolFee).add(creatorFee),
    potFeeShare: creatorFee.mul(POT_SHARE_BPS).div(new BN(10000)),
    protocolFeeBps: fees.protocolFeeBps,
    creatorFeeBps: fees.creatorFeeBps,
  };
}

async function readLiveState(connection, user, amount, slippageBps) {
  const onlineSdk = new OnlinePumpSdk(connection);
  const [configPda, configBump] = pda([ETUDE_CONFIG_SEED], PROGRAM_ID);
  const [potAuthority, potBump] = pda([ETUDE_POT_SEED], PROGRAM_ID);
  const baseMintInfoPromise = retry("mint accounts", () =>
    connection.getMultipleAccountsInfo([STOCX_MINT, TSLAX_MINT], "confirmed"));
  const [global, feeConfig, bondingCurve, resolvedTslax, configInfo] = await Promise.all([
    retry("pump global", () => onlineSdk.fetchGlobal()),
    retry("pump fee config", () => onlineSdk.fetchFeeConfig()),
    retry("STOCX bonding curve", () => onlineSdk.fetchBondingCurve(STOCX_MINT)),
    retry("TSLAx quote resolve", () => onlineSdk.resolveQuoteMint(TSLAX_MINT)),
    retry("Etude config", () => connection.getAccountInfo(configPda, "confirmed")),
  ]);
  const [stocxMintInfo, tslaxMintInfo] = await baseMintInfoPromise;
  if (!stocxMintInfo) throw new Error("STOCX mint account is missing");
  if (!tslaxMintInfo) throw new Error("TSLAx mint account is missing");
  const stocxMint = unpackMint(STOCX_MINT, stocxMintInfo, stocxMintInfo.owner);
  const tslaxMint = unpackMint(TSLAX_MINT, tslaxMintInfo, tslaxMintInfo.owner);
  const quoteMint = normalizeQuoteMint(bondingCurve.quoteMint);
  const quoteTokenProgram = resolvedTslax.quoteTokenProgram;
  const baseTokenProgram = stocxMintInfo.owner;
  const quoteWithoutSlippage = getBuySolAmountFromTokenAmount({
    global,
    feeConfig,
    mintSupply: new BN(stocxMint.supply.toString()),
    bondingCurve,
    amount,
    quoteMint,
  });
  const quoteWithSlippage = addSlippageBps(quoteWithoutSlippage, slippageBps);
  const associatedBaseUser = getAssociatedTokenAddressSync(
    STOCX_MINT,
    user,
    true,
    baseTokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const associatedQuoteUser = quoteAta(user, TSLAX_MINT, quoteTokenProgram);
  const potTslaxAta = getAssociatedTokenAddressSync(
    TSLAX_MINT,
    potAuthority,
    true,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const [activityRecord, activityBump] = pda([
    ETUDE_ACTIVITY_SEED,
    configPda.toBuffer(),
    user.toBuffer(),
  ], PROGRAM_ID);
  const [userInfo, baseAtaInfo, quoteAtaInfo, potAtaInfo, activityInfo] = await retry("player accounts", () =>
    connection.getMultipleAccountsInfo([
      user,
      associatedBaseUser,
      associatedQuoteUser,
      potTslaxAta,
      activityRecord,
    ], "confirmed"));
  const config = decodeConfig(configInfo);
  const activity = decodeActivity(activityInfo);
  const quoteAccount = tokenAccountSummary(
    associatedQuoteUser,
    quoteAtaInfo,
    quoteTokenProgram,
    TSLAX_MINT,
    user,
    tslaxMint.decimals
  );
  const potAccount = tokenAccountSummary(
    potTslaxAta,
    potAtaInfo,
    TOKEN_2022_PROGRAM_ID,
    TSLAX_MINT,
    potAuthority,
    tslaxMint.decimals
  );
  const costs = buyCostBreakdown(
    global,
    feeConfig,
    new BN(stocxMint.supply.toString()),
    bondingCurve,
    amount,
    quoteMint
  );

  return {
    global,
    feeConfig,
    bondingCurve,
    baseTokenProgram,
    quoteTokenProgram,
    quoteMint,
    stocxDecimals: stocxMint.decimals,
    tslaxDecimals: tslaxMint.decimals,
    stocxSupply: new BN(stocxMint.supply.toString()),
    configPda,
    configBump,
    potAuthority,
    potBump,
    potTslaxAta,
    associatedBaseUser,
    associatedQuoteUser,
    activityRecord,
    activityBump,
    accountInfo: {
      userExists: Boolean(userInfo),
      userSolLamports: userInfo ? userInfo.lamports : 0,
      baseAtaExists: Boolean(baseAtaInfo),
      quoteAta: quoteAccount,
      potAta: potAccount,
      activity,
    },
    config,
    price: {
      baseAmountRaw: amount.toString(),
      baseAmountUi: rawUi(amount, stocxMint.decimals),
      quoteWithoutSlippageRaw: quoteWithoutSlippage.toString(),
      quoteWithoutSlippageUi: rawUi(quoteWithoutSlippage, tslaxMint.decimals),
      quoteWithSlippageRaw: quoteWithSlippage.toString(),
      quoteWithSlippageUi: rawUi(quoteWithSlippage, tslaxMint.decimals),
      slippageBps,
      protocolFeeRaw: costs ? costs.protocolFee.toString() : null,
      creatorFeeRaw: costs ? costs.creatorFee.toString() : null,
      estimatedPotInflowRaw: costs ? costs.potFeeShare.toString() : null,
      estimatedPotInflowUi: costs ? rawUi(costs.potFeeShare, tslaxMint.decimals) : null,
      protocolFeeBps: costs ? costs.protocolFeeBps.toString() : null,
      creatorFeeBps: costs ? costs.creatorFeeBps.toString() : null,
    },
  };
}

function makeRecordActivityIx({ user, state, side }) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: state.configPda, isSigner: false, isWritable: false },
      { pubkey: state.potTslaxAta, isSigner: false, isWritable: true },
      { pubkey: state.associatedQuoteUser, isSigner: false, isWritable: true },
      { pubkey: state.potAuthority, isSigner: false, isWritable: false },
      { pubkey: TSLAX_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: state.activityRecord, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([
      2,
      state.configBump,
      state.potBump,
      side,
      state.activityBump,
      1,
    ]),
  });
}

async function buildInstructions({ user, state, amount, side, includeBaseAta }) {
  const fixedFeeRecipient = state.global.feeRecipient;
  const buyIx = await PUMP_SDK.getBuyV2InstructionRaw({
    user,
    mint: STOCX_MINT,
    creator: state.bondingCurve.creator,
    amount,
    quoteAmount: new BN(state.price.quoteWithSlippageRaw),
    feeRecipient: fixedFeeRecipient,
    buybackFeeRecipient: PUMP_BUYBACK_FEE_RECIPIENT,
    tokenProgram: state.baseTokenProgram,
    quoteMint: TSLAX_MINT,
    quoteTokenProgram: state.quoteTokenProgram,
  });
  const named = [
    { name: "compute_limit", ix: ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }) },
    { name: "priority_fee", ix: ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }) },
  ];
  const createBase = includeBaseAta === "always" || (includeBaseAta === "auto" && !state.accountInfo.baseAtaExists);
  if (createBase) {
    named.push({
      name: "create_user_base_ata",
      ix: createAssociatedTokenAccountIdempotentInstruction(
        user,
        state.associatedBaseUser,
        user,
        STOCX_MINT,
        state.baseTokenProgram,
        ASSOCIATED_TOKEN_PROGRAM_ID
      ),
    });
  }
  named.push({ name: "buy_v2", ix: buyIx });
  named.push({ name: "record_activity", ix: makeRecordActivityIx({ user, state, side }) });
  return named;
}

function labelInstructionAccounts(namedInstructions) {
  const buyLabels = [
    "global",
    "base_mint",
    "quote_mint",
    "base_token_program",
    "quote_token_program",
    "associated_token_program",
    "fee_recipient",
    "associated_quote_fee_recipient",
    "buyback_fee_recipient",
    "associated_quote_buyback_fee_recipient",
    "bonding_curve",
    "associated_base_bonding_curve",
    "associated_quote_bonding_curve",
    "user",
    "associated_base_user",
    "associated_quote_user",
    "creator_vault",
    "associated_creator_vault",
    "sharing_config",
    "global_volume_accumulator",
    "user_volume_accumulator",
    "associated_user_volume_accumulator",
    "fee_config",
    "fee_program",
    "system_program",
    "event_authority",
    "program",
  ];
  const labelSets = {
    compute_limit: [],
    priority_fee: [],
    create_user_base_ata: ["payer", "ata", "wallet", "mint", "system_program", "token_program"],
    buy_v2: buyLabels,
    record_activity: [
      "caller",
      "etude_config",
      "pot_token_account",
      "caller_token_account",
      "pot_authority",
      "quote_mint",
      "token_2022_program",
      "system_program",
      "associated_token_program",
      "activity_record",
      "instructions_sysvar",
    ],
  };
  const labels = new Map();
  function add(pubkey, label) {
    const address = pubkey.toBase58();
    const current = labels.get(address) || [];
    if (!current.includes(label)) current.push(label);
    labels.set(address, current);
  }
  for (const { name, ix } of namedInstructions) {
    add(ix.programId, `program:${name}`);
    const accountLabels = labelSets[name] || [];
    ix.keys.forEach((key, index) => add(key.pubkey, `${name}.${accountLabels[index] || index}`));
  }
  return labels;
}

function staticReasons(feePayer, namedInstructions) {
  const reasons = new Map();
  function add(pubkey, reason) {
    const address = pubkey.toBase58();
    const current = reasons.get(address) || [];
    if (!current.includes(reason)) current.push(reason);
    reasons.set(address, current);
  }
  add(feePayer, "fee-payer");
  for (const { ix } of namedInstructions) {
    add(ix.programId, "top-level-program-id");
    for (const key of ix.keys) {
      if (key.isSigner) add(key.pubkey, "signer");
    }
  }
  for (const key of [
    PUMP_PROGRAM_ID,
    PROGRAM_ID,
    ComputeBudgetProgram.programId,
    TOKEN_2022_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    SystemProgram.programId,
    SYSVAR_INSTRUCTIONS_PUBKEY,
    PUMP_FEE_PROGRAM_ID,
  ]) {
    add(key, "core-or-proof-account");
  }
  return reasons;
}

function lookupCandidates(namedInstructions, staticMap, labelMap) {
  const rows = new Map();
  for (const { ix } of namedInstructions) {
    for (const key of ix.keys) {
      const address = key.pubkey.toBase58();
      if (key.isSigner || staticMap.has(address)) continue;
      const current = rows.get(address) || {
        address,
        writable: false,
        labels: labelMap.get(address) || [],
      };
      current.writable = current.writable || key.isWritable;
      rows.set(address, current);
    }
  }
  return [...rows.values()];
}

function isPlayerSpecific(row) {
  return row.labels.some((label) => (
    label.includes("associated_base_user")
    || label.includes("associated_quote_user")
    || label.includes("caller_token_account")
    || label.includes("user_volume_accumulator")
    || label.includes("activity_record")
  ));
}

function legacySize(namedInstructions, feePayer) {
  const tx = new Transaction({
    feePayer,
    recentBlockhash: PublicKey.unique().toBase58(),
  }).add(...namedInstructions.map((row) => row.ix));
  const messageBytes = tx.serializeMessage().length;
  try {
    const bytes = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }).length;
    return {
      transactionBytes: bytes,
      messageBytes,
      requiredSignatures: tx.signatures.length,
      fitsPacket: bytes <= MAX_PACKET_BYTES,
      headroomBytes: MAX_PACKET_BYTES - bytes,
    };
  } catch (err) {
    return {
      messageBytes,
      fitsPacket: false,
      error: String(err.message || err),
    };
  }
}

function syntheticLookupTable(authority, rows, key = PublicKey.unique()) {
  return new AddressLookupTableAccount({
    key,
    state: {
      deactivationSlot: MAX_U64,
      lastExtendedSlot: 1n,
      lastExtendedSlotStartIndex: 0,
      authority,
      addresses: rows.map((row) => new PublicKey(row.address)),
    },
  });
}

function compileV0(namedInstructions, feePayer, lookupTables, recentBlockhash = PublicKey.unique().toBase58()) {
  const message = new TransactionMessage({
    payerKey: feePayer,
    recentBlockhash,
    instructions: namedInstructions.map((row) => row.ix),
  }).compileToV0Message(lookupTables);
  const tx = new VersionedTransaction(message);
  const bytes = Buffer.from(tx.serialize()).length;
  return {
    transactionBytes: bytes,
    requiredSignatures: tx.signatures.length,
    fitsPacket: bytes <= MAX_PACKET_BYTES,
    headroomBytes: MAX_PACKET_BYTES - bytes,
    staticAccountKeyCount: message.staticAccountKeys.length,
    lookupAddressCount: message.addressTableLookups.reduce(
      (sum, lookup) => sum + lookup.writableIndexes.length + lookup.readonlyIndexes.length,
      0
    ),
    lookupTablesUsed: message.addressTableLookups.length,
    staticAccountKeys: message.staticAccountKeys.map((key) => key.toBase58()),
    lookups: message.addressTableLookups.map((lookup) => ({
      accountKey: lookup.accountKey.toBase58(),
      writableIndexes: lookup.writableIndexes,
      readonlyIndexes: lookup.readonlyIndexes,
    })),
    tx,
  };
}

function activeLength(table, currentSlot) {
  if (BigInt(currentSlot) > BigInt(table.state.lastExtendedSlot)) return table.state.addresses.length;
  return Number(table.state.lastExtendedSlotStartIndex);
}

async function readLiveAlt(connection, altAddress) {
  const [currentSlot, tableResponse] = await Promise.all([
    retry("current slot", () => connection.getSlot("confirmed")),
    retry("lookup table", () => connection.getAddressLookupTable(altAddress, { commitment: "confirmed" })),
  ]);
  const table = tableResponse.value;
  if (!table) {
    return {
      table: null,
      summary: {
        address: altAddress.toBase58(),
        exists: false,
        activeAddressCount: 0,
        totalAddressCount: 0,
      },
    };
  }
  const active = table.state.addresses.slice(0, activeLength(table, currentSlot));
  return {
    table,
    summary: {
      address: altAddress.toBase58(),
      exists: true,
      authority: table.state.authority ? table.state.authority.toBase58() : null,
      activeAddressCount: active.length,
      totalAddressCount: table.state.addresses.length,
      deactivationSlot: table.state.deactivationSlot.toString(),
      lastExtendedSlot: table.state.lastExtendedSlot.toString(),
    },
  };
}

function gateReport({ user, state, amount, side }) {
  const failures = [];
  const warnings = [];
  if (!state.config) failures.push("Etude config PDA is missing");
  if (state.config) {
    if (state.config.isInit !== 1) failures.push("Etude config is not initialized");
    if (state.config.mint !== STOCX_MINT.toBase58()) failures.push("Etude config mint is not STOCX");
    if (state.config.quoteMint !== TSLAX_MINT.toBase58()) failures.push("Etude config quote mint is not TSLAx");
    if (BigInt(state.config.minTradeAmountRaw) > BigInt(amount.toString())) {
      failures.push(`base amount is below min_trade_amount ${state.config.minTradeAmountRaw}`);
    }
  }
  if (!state.accountInfo.potAta.exists) failures.push("TSLAx pot ATA is missing");
  if (!state.accountInfo.quoteAta.exists) failures.push("player TSLAx ATA is missing");
  if (state.accountInfo.quoteAta.exists) {
    const have = BigInt(state.accountInfo.quoteAta.amountRaw);
    const need = BigInt(state.price.quoteWithSlippageRaw);
    if (have < need) failures.push(`player TSLAx balance is ${state.accountInfo.quoteAta.amountUi}; needs ${state.price.quoteWithSlippageUi}`);
  }
  if (side !== 0 && side !== 1) failures.push("side must be 0 or 1");
  if (state.bondingCurve.complete) failures.push("STOCX bonding curve is already complete/migrated");
  if (!state.quoteMint.equals(TSLAX_MINT)) failures.push("STOCX bonding curve is not TSLAx quoted");
  if (!state.quoteTokenProgram.equals(TOKEN_2022_PROGRAM_ID)) failures.push("TSLAx quote token program is not Token-2022");
  if (!state.bondingCurve.creator.equals(feeSharingConfigPda(STOCX_MINT))) {
    failures.push("STOCX creator is not the fee-sharing config PDA");
  }
  if (!state.accountInfo.baseAtaExists) warnings.push("player STOCX ATA will be created idempotently in the same transaction");
  if (state.accountInfo.activity?.isInit === 1) {
    warnings.push("player already has an activity record; cooldown and side-flip rules apply");
  }
  return {
    ok: failures.length === 0,
    failures,
    warnings,
    user: user.toBase58(),
  };
}

function b64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58encode(bytes) {
  if (bytes.length === 0) return "";
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  const digits = [];
  for (let i = zeros; i < bytes.length; i += 1) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j += 1) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i -= 1) out += B58_ALPHABET[digits[i]];
  return out;
}

async function buildForUser({ user, altAddress, amount, slippageBps, side, includeBaseAta, serialize }) {
  const connection = makeConnection();
  const state = await readLiveState(connection, user, amount, slippageBps);
  const named = await buildInstructions({ user, state, amount, side, includeBaseAta });
  const labelMap = labelInstructionAccounts(named);
  const staticMap = staticReasons(user, named);
  const lookupRows = lookupCandidates(named, staticMap, labelMap);
  const globalLookupRows = lookupRows.filter((row) => !isPlayerSpecific(row));
  const legacy = legacySize(named, user);
  const noLookup = compileV0(named, user, []);
  const fullSyntheticAlt = compileV0(named, user, [syntheticLookupTable(user, lookupRows)]);
  const globalSyntheticAlt = compileV0(named, user, [syntheticLookupTable(user, globalLookupRows)]);
  const liveAlt = await readLiveAlt(connection, altAddress);
  const liveAltCompile = liveAlt.table ? compileV0(named, user, [liveAlt.table]) : null;
  const gate = gateReport({ user, state, amount, side });
  const latest = serialize && gate.ok && liveAltCompile?.fitsPacket
    ? await retry("latest blockhash", () => connection.getLatestBlockhash("confirmed"))
    : null;
  const liveTx = serialize && gate.ok && liveAlt.table && liveAltCompile?.fitsPacket
    ? compileV0(named, user, [liveAlt.table], latest.blockhash)
    : null;
  const txBytes = liveTx ? Buffer.from(liveTx.tx.serialize()) : null;
  const expectedRewardRaw = (() => {
    const reward = BigInt(state.config?.activityRewardAmountRaw || "0");
    const activity = state.accountInfo.activity;
    if (!activity || activity.isInit !== 1) return reward;
    return activity.lastSide !== side ? reward * 2n : reward;
  })();

  return {
    rpc: RPC,
    ca: STOCX_MINT.toBase58(),
    pumpPage: `https://pump.fun/coin/${STOCX_MINT.toBase58()}`,
    user: user.toBase58(),
    program: PROGRAM_ID.toBase58(),
    alt: liveAlt.summary,
    accounts: {
      config: state.configPda.toBase58(),
      potAuthority: state.potAuthority.toBase58(),
      potTslaxAta: state.potTslaxAta.toBase58(),
      playerStocxAta: state.associatedBaseUser.toBase58(),
      playerTslaxAta: state.associatedQuoteUser.toBase58(),
      activityRecord: state.activityRecord.toBase58(),
    },
    accountInfo: state.accountInfo,
    config: state.config,
    price: state.price,
    expectedReward: {
      raw: expectedRewardRaw.toString(),
      ui: rawUi(expectedRewardRaw, state.tslaxDecimals),
      token: "TSLAx",
    },
    gates: gate,
    instructions: named.map((row) => ({
      name: row.name,
      programId: row.ix.programId.toBase58(),
      accountCount: row.ix.keys.length,
      dataBytes: row.ix.data.length,
    })),
    packet: {
      legacy,
      v0NoLookup: {
        transactionBytes: noLookup.transactionBytes,
        fitsPacket: noLookup.fitsPacket,
        headroomBytes: noLookup.headroomBytes,
        staticAccountKeyCount: noLookup.staticAccountKeyCount,
      },
      v0FullSyntheticAlt: {
        transactionBytes: fullSyntheticAlt.transactionBytes,
        fitsPacket: fullSyntheticAlt.fitsPacket,
        headroomBytes: fullSyntheticAlt.headroomBytes,
        lookupAddressCount: fullSyntheticAlt.lookupAddressCount,
        lookupCandidateCount: lookupRows.length,
      },
      v0GlobalSyntheticAlt: {
        transactionBytes: globalSyntheticAlt.transactionBytes,
        fitsPacket: globalSyntheticAlt.fitsPacket,
        headroomBytes: globalSyntheticAlt.headroomBytes,
        lookupAddressCount: globalSyntheticAlt.lookupAddressCount,
        lookupCandidateCount: globalLookupRows.length,
      },
      v0LiveAlt: liveAltCompile ? {
        transactionBytes: liveAltCompile.transactionBytes,
        fitsPacket: liveAltCompile.fitsPacket,
        headroomBytes: liveAltCompile.headroomBytes,
        lookupAddressCount: liveAltCompile.lookupAddressCount,
        lookupTablesUsed: liveAltCompile.lookupTablesUsed,
        staticAccountKeyCount: liveAltCompile.staticAccountKeyCount,
      } : null,
    },
    lookupRows,
    playerSpecificLookupRows: lookupRows.filter(isPlayerSpecific),
    transaction: txBytes ? {
      type: "solana:v0",
      encoding: "base64",
      serializedBase64: b64(txBytes),
      serializedBase58: b58encode(txBytes),
      message: b58encode(txBytes),
      base64: b64(txBytes),
      bytes: txBytes.length,
      recentBlockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
      signer: user.toBase58(),
      sendOptions: {
        skipPreflight: false,
        preflightCommitment: "confirmed",
        maxRetries: 3,
      },
    } : null,
    transactionStatus: txBytes
      ? "ready_for_wallet_signature"
      : (liveAltCompile?.fitsPacket ? "blocked_by_wallet_or_chain_gate" : "blocked_by_packet_size"),
    status: !liveAltCompile?.fitsPacket
      ? "STATUS: STOCX_PLAYER_TRADE_RECORD_NEEDS_ALT_OR_SMALLER_PACKET"
      : (gate.ok ? "OK: STOCX_PLAYER_TRADE_RECORD_READY" : "STATUS: STOCX_PLAYER_GATES_BLOCKED"),
  };
}

function parseBuildArgs(argv = process.argv) {
  const user = pubkeyArg("--user", null, argv);
  if (!user) throw new Error("Missing --user <pubkey>");
  const amount = u64Arg("--base-amount", DEFAULT_BASE_AMOUNT_RAW, argv);
  const slippageBps = intArg("--slippage-bps", DEFAULT_SLIPPAGE_BPS, argv);
  const side = intArg("--side", DEFAULT_SIDE, argv);
  const includeBaseAta = argValue("--include-base-ata", "always", argv);
  if (!["always", "auto", "never"].includes(includeBaseAta)) {
    throw new Error("--include-base-ata must be always, auto, or never");
  }
  const altAddress = pubkeyArg("--alt", DEFAULT_ALT.toBase58(), argv);
  return { user, altAddress, amount, slippageBps, side, includeBaseAta };
}

const rateBuckets = new Map();

function clientIp(req) {
  const forwarded = req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function rateLimit(req) {
  if (!RATE_LIMIT_MAX || RATE_LIMIT_MAX < 1) return null;
  const now = Date.now();
  const key = clientIp(req);
  const current = rateBuckets.get(key);
  if (!current || now - current.startedAt > RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return null;
  }
  current.count += 1;
  if (current.count > RATE_LIMIT_MAX) {
    const retryAfter = Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - current.startedAt)) / 1000));
    return { retryAfter, key };
  }
  return null;
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin) return {};
  if (!ALLOWED_ORIGINS.has("*") && !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "access-control-allow-origin": ALLOWED_ORIGINS.has("*") ? "*" : origin,
    "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization, Content-Encoding, Accept-Encoding",
    "vary": "Origin",
  };
}

function originAllowed(req) {
  const origin = req.headers.origin;
  return !origin || ALLOWED_ORIGINS.has("*") || ALLOWED_ORIGINS.has(origin);
}

function writeJson(req, res, statusCode, body, extraHeaders = {}) {
  const json = JSON.stringify(body, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...corsHeaders(req),
    ...extraHeaders,
  });
  res.end(json);
}

function statusForError(message) {
  if (/Missing|Non-base58|Invalid public key|must be/i.test(message)) return 400;
  return 500;
}

async function readRequestJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function commandServe() {
  const port = intArg("--port", DEFAULT_PORT);
  const defaultAlt = pubkeyArg("--alt", DEFAULT_ALT.toBase58());
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        if (!originAllowed(req)) return writeJson(req, res, 403, { error: "origin_not_allowed" });
        return writeJson(req, res, 204, {});
      }
      const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
      if (url.pathname === "/health") {
        return writeJson(req, res, 200, { ok: true, service: "stocx-player-builder" });
      }
      if (url.pathname === "/actions.json" && req.method === "GET") {
        return writeJson(req, res, 200, {
          rules: [
            {
              pathPattern: "/",
              apiPath: "/api/stocx/pay",
            },
            {
              pathPattern: "/api/stocx/pay",
              apiPath: "/api/stocx/pay",
            },
          ],
        });
      }
      if (!originAllowed(req)) {
        return writeJson(req, res, 403, { error: "origin_not_allowed" });
      }
      const limited = rateLimit(req);
      if (limited) {
        return writeJson(req, res, 429, {
          error: "rate_limited",
          retryAfterSeconds: limited.retryAfter,
        }, {
          "retry-after": String(limited.retryAfter),
        });
      }
      if (url.pathname === "/api/stocx/pay" && req.method === "GET") {
        return writeJson(req, res, 200, {
          type: "action",
          title: "STOCX Reward TX",
          icon: `${SITE_URL}/stocx-token.svg`,
          description: "Buy STOCX with TSLAx, record the proof on-chain, and receive a TSLAx reward from the live pot when the gate passes.",
          label: "Build Reward TX",
        });
      }
      if (
        url.pathname !== "/api/stocx/build" &&
        url.pathname !== "/api/stocx/measure" &&
        url.pathname !== "/api/stocx/pay"
      ) {
        return writeJson(req, res, 404, { error: "not_found" });
      }
      const body = req.method === "POST" ? await readRequestJson(req) : {};
      const value = (name, fallback = null) => url.searchParams.get(name) ?? body[name] ?? fallback;
      const user = new PublicKey(value("user", body.account));
      const altAddress = new PublicKey(value("alt", defaultAlt.toBase58()));
      const amount = new BN(String(value("baseAmountRaw", DEFAULT_BASE_AMOUNT_RAW)));
      const slippageBps = Number(value("slippageBps", DEFAULT_SLIPPAGE_BPS));
      const side = Number(value("side", DEFAULT_SIDE));
      const includeBaseAta = value("includeBaseAta", "always");
      const result = await buildForUser({
        user,
        altAddress,
        amount,
        slippageBps,
        side,
        includeBaseAta,
        serialize: url.pathname === "/api/stocx/build" || url.pathname === "/api/stocx/pay",
      });
      if (url.pathname === "/api/stocx/pay") {
        const tx = result.transaction?.serializedBase64;
        if (!tx) {
          return writeJson(req, res, 400, {
            error: result.gates?.failures?.[0] || result.transactionStatus || "transaction_not_ready",
            message: "STOCX reward transaction is not ready for this wallet.",
          });
        }
        return writeJson(req, res, 200, {
          transaction: tx,
          message: `Buy ${result.price.baseAmountUi} STOCX and record ${result.expectedReward.ui} TSLAx reward proof.`,
        });
      }
      return writeJson(req, res, 200, result);
    } catch (err) {
      const message = String(err.message || err);
      return writeJson(req, res, statusForError(message), { error: message });
    }
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`STOCX builder listening on http://127.0.0.1:${port}`);
  });
}

async function main() {
  const cmd = process.argv[2] || "measure";
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    usage();
    return;
  }
  if (cmd === "serve") {
    await commandServe();
    return;
  }
  if (cmd !== "measure" && cmd !== "build") throw new Error(`Unknown command: ${cmd}`);
  const args = parseBuildArgs();
  const result = await buildForUser({ ...args, serialize: cmd === "build" });
  console.log(JSON.stringify(result, null, 2));
  console.log(result.status);
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
