import * as anchor from "@project-serum/anchor";
import { TypeDef } from "@project-serum/anchor/dist/cjs/program/namespace/types";
import {
  IFarmInfo,
  INFTFarmInfo,
  IPoolInfo,
  INFTPoolInfo,
  IReserveInfo,
  IVaultInfo,
} from "@dappio-wonderland/navigator";
import { RouteInfo, TransactionFeeInfo } from "@jup-ag/core";

export const PAYLOAD_SIZE = 32;

export interface IProtocolSwap {
  swap: () => void;
  getSwapMinOutAmount: () => void;
}

export interface IProtocolPool {
  addLiquidity: (
    params: AddLiquidityParams,
    pool: IPoolInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }>;
  removeLiquidity: (
    params: RemoveLiquidityParams,
    pool: IPoolInfo,
    userKey: anchor.web3.PublicKey,
    singleToTokenMint?: anchor.web3.PublicKey
  ) => Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }>;
}

export interface IProtocolNFTPool {
  lockNFT: (
    params: LockNFTParams,
    pool: INFTPoolInfo,
    userKey: anchor.web3.PublicKey,
    userNftMint?: anchor.web3.PublicKey[]
  ) => Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }>;
  unlockNFT: (
    params: UnlockNFTParams,
    pool: INFTPoolInfo,
    userKey: anchor.web3.PublicKey,
    nftMint?: anchor.web3.PublicKey[]
  ) => Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }>;
}

export interface IProtocolFarm {
  stake: (
    params: StakeParams,
    farm: IFarmInfo,
    userKey: anchor.web3.PublicKey,
    farmerKey?: anchor.web3.PublicKey
  ) => Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }>;
  unstake: (
    params: UnstakeParams,
    farm: IFarmInfo,
    userKey: anchor.web3.PublicKey,
    farmerKey?: anchor.web3.PublicKey
  ) => Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }>;
  harvest: (
    params: HarvestParams,
    farm: IFarmInfo,
    userKey: anchor.web3.PublicKey,
    farmerKey?: anchor.web3.PublicKey
  ) => Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }>;
}

export interface IProtocolNFTFarm {
  stakeProof: (
    params: StakeProofParams,
    farm: INFTFarmInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }>;
  unstakeProof: (
    params: UnstakeProofParams,
    farm: INFTFarmInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }>;
  claim: (
    params: ClaimParams,
    farm: INFTFarmInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }>;
}

export interface IProtocolMoneyMarket {
  supply: (
    params: SupplyParams,
    reserve: IReserveInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }>;
  collateralize: (
    params: CollateralizeParams,
    reserve: IReserveInfo,
    userKey: anchor.web3.PublicKey,
    obligationKey?: anchor.web3.PublicKey
  ) => Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }>;
  unsupply: (
    params: UnsupplyParams,
    reserve: IReserveInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }>;
  uncollateralize: (
    params: UncollateralizeParams,
    reserve: IReserveInfo,
    userKey: anchor.web3.PublicKey,
    obligationKey?: anchor.web3.PublicKey
  ) => Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }>;
  borrow?: (
    params: BorrowParams,
    reserve: IReserveInfo,
    userKey: anchor.web3.PublicKey,
    obligationKey?: anchor.web3.PublicKey
  ) => Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }>;
  repay?: (
    params: RepayParams,
    reserve: IReserveInfo,
    userKey: anchor.web3.PublicKey,
    obligationKey?: anchor.web3.PublicKey
  ) => Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }>;
  claimCollateralReward?: (
    params: ClaimCollateralRewardParams,
    userKey: anchor.web3.PublicKey,
    obligationKey?: anchor.web3.PublicKey
  ) => Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }>;
}

export interface IProtocolVault {
  deposit?: (
    params: DepositParams,
    vaultId: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }>;
  withdraw?: (
    params: WithdrawParams,
    vaultId: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }>;
  initiateWithdrawal?: (
    params: WithdrawParams,
    vaultId: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }>;
  initiateDeposit?: (
    params: DepositParams,
    vaultId: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }>;
  finalizeDeposit?: (
    params: WithdrawParams,
    vaultId: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }>;
  cancelDeposit?: (
    params: WithdrawParams,
    vaultId: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }>;
  finalizeWithdrawal?: (
    params: WithdrawParams,
    vaultId: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }>;
  cancelWithdrawal?: (
    params: WithdrawParams,
    vaultId: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<{ txs: anchor.web3.Transaction[]; input: Buffer }>;
}

export enum ActionType {
  Swap = 0,
  AddLiquidity = 1,
  RemoveLiquidity = 2,
  RemoveLiquiditySingle = 3,
  Stake = 4,
  Unstake = 5,
  Harvest = 6, // reward from DeFi farming
  Supply = 7,
  Unsupply = 8,
  Borrow = 9,
  Repay = 10,
  Collateralize = 11,
  Uncollateralize = 12,
  ClaimCollateralReward = 20, // TODO: Change name

  // For normal vault
  Deposit = 13,
  Withdraw = 14,

  // For vault with epoch
  InitiateDeposit = 21,
  FinalizeDeposit = 22,
  CancelDeposit = 23,
  InitiateWithdrawal = 24,
  FinalizeWithdrawal = 25,
  CancelWithdrawal = 26,

  // For NFT
  LockNft = 15,
  UnlockNft = 16,
  StakeProof = 17,
  UnstakeProof = 18,
  Claim = 19, // reward from NFT farming
}

export enum SupportedProtocols {
  Jupiter = 0,
  Raydium = 1,
  Saber = 2,
  Solend = 3,
  Larix = 4,
  Lifinity = 5,
  Orca = 6,
  Tulip = 7,
  NftFinance = 8,
  Francium = 9,
  Friktion = 10,
  Katana = 11,
}

export interface RouteInfoExtend extends RouteInfo {
  transactionFeeInfo: TransactionFeeInfo;
}

export interface GatewayMetadata {
  // Infos
  pool?: IPoolInfo;
  farm?: IFarmInfo;
  reserve?: IReserveInfo;
  vault?: IVaultInfo;
  nftPool?: INFTPoolInfo;
  nftFarm?: INFTFarmInfo;
  routes?: RouteInfoExtend[];

  // Metadata
  fromTokenMint?: anchor.web3.PublicKey;
  toTokenMint?: anchor.web3.PublicKey;
  addLiquidityTokenMint?: anchor.web3.PublicKey;
  removeLiquiditySingleToTokenMint?: anchor.web3.PublicKey;
}

export interface SwapParams {
  protocol: SupportedProtocols;
  fromTokenMint: anchor.web3.PublicKey;
  toTokenMint: anchor.web3.PublicKey;
  amount: number;
  slippage: number;
}

export interface AddLiquidityParams {
  protocol: SupportedProtocols;
  poolId: anchor.web3.PublicKey;
  tokenInAmount?: number;
  tokenMint?: anchor.web3.PublicKey;
  version?: number;
}

export interface RemoveLiquidityParams {
  protocol: SupportedProtocols;
  poolId: anchor.web3.PublicKey;
  lpAmount?: number;
  singleToTokenMint?: anchor.web3.PublicKey;
  version?: number;
}

export interface StakeParams {
  protocol: SupportedProtocols;
  farmId: anchor.web3.PublicKey;
  farmerKey?: anchor.web3.PublicKey;
  lpAmount?: number;
  version?: number;
}

export interface UnstakeParams {
  protocol: SupportedProtocols;
  farmId: anchor.web3.PublicKey;
  shareAmount: number;
  farmerKey?: anchor.web3.PublicKey;
  version?: number;
}

export interface HarvestParams {
  protocol: SupportedProtocols;
  farmId: anchor.web3.PublicKey;
  farmerKey?: anchor.web3.PublicKey;
  version?: number;
}

export interface SupplyParams {
  protocol: SupportedProtocols;
  reserveId: anchor.web3.PublicKey;
  supplyAmount: number;
  version?: number;
}

export interface CollateralizeParams {
  protocol: SupportedProtocols;
  reserveId: anchor.web3.PublicKey;
  collateralizeAmount?: number;
  obligationKey?: anchor.web3.PublicKey;
  version?: number;
}

export interface UnsupplyParams {
  protocol: SupportedProtocols;
  reserveId: anchor.web3.PublicKey;
  reservedAmount: number;
  version?: number;
}

export interface UncollateralizeParams {
  protocol: SupportedProtocols;
  reserveId: anchor.web3.PublicKey;
  uncollateralizeAmount: number;
  obligationKey?: anchor.web3.PublicKey;
  version?: number;
}

export interface BorrowParams {
  protocol: SupportedProtocols;
  reserveId: anchor.web3.PublicKey;
  borrowAmount: number;
  obligationKey?: anchor.web3.PublicKey;
  version?: number;
}

export interface RepayParams {
  protocol: SupportedProtocols;
  reserveId: anchor.web3.PublicKey;
  repayAmount: number;
  obligationKey?: anchor.web3.PublicKey;
  version?: number;
}

export interface ClaimCollateralRewardParams {
  protocol: SupportedProtocols;
  reserveId?: anchor.web3.PublicKey;
  obligationKey?: anchor.web3.PublicKey;
  version?: number;
}

export interface DepositParams {
  protocol: SupportedProtocols;
  vaultId: anchor.web3.PublicKey;
  depositAmount: number;
  version?: number;
}

export interface WithdrawParams {
  protocol: SupportedProtocols;
  vaultId: anchor.web3.PublicKey;
  withdrawAmount: number;
  version?: number;
}

export interface LockNFTParams {
  protocol: SupportedProtocols;
  poolId: anchor.web3.PublicKey;
  userNftAccount?: anchor.web3.PublicKey[];
  nftMint?: anchor.web3.PublicKey[];
  version?: number;
}

export interface UnlockNFTParams {
  protocol: SupportedProtocols;
  poolId: anchor.web3.PublicKey;
  userNftAccount?: anchor.web3.PublicKey[];
  nftMint?: anchor.web3.PublicKey[];
  version?: number;
}

export interface StakeProofParams {
  protocol: SupportedProtocols;
  farmId: anchor.web3.PublicKey;
  proveTokenAmount: number;
  version?: number;
}

export interface UnstakeProofParams {
  protocol: SupportedProtocols;
  farmId: anchor.web3.PublicKey;
  farmTokenAmount: number;
  version?: number;
}

export interface ClaimParams {
  protocol: SupportedProtocols;
  farmId: anchor.web3.PublicKey;
  rewardTokenAmount: number;
  version?: number;
}

export enum PoolDirection {
  Obverse,
  Reverse,
}

export type GatewayParams = TypeDef<
  {
    name: "GatewayParams";
    type: {
      kind: "struct";
      fields: [
        {
          name: "version";
          type: "u8";
        },
        {
          name: "currentIndex";
          type: "u8";
        },
        {
          name: "queueSize";
          type: "u8";
        },
        {
          name: "protocolQueue";
          type: {
            array: ["u8", 8];
          };
        },
        {
          name: "actionQueue";
          type: {
            array: ["u8", 8];
          };
        },
        {
          name: "versionQueue";
          type: {
            array: ["u8", 8];
          };
        },
        {
          name: "payloadQueue";
          type: {
            array: ["u64", 8];
          };
        },
        {
          name: "payloadQueue2";
          type: {
            array: [
              {
                array: ["u8", 32];
              },
              8
            ];
          };
        },
        {
          name: "inputIndexQueue";
          type: {
            array: ["u8", 8];
          };
        },
        {
          name: "swapMinOutAmount";
          type: "u64";
        },
        {
          name: "poolDirection";
          type: "u8";
        }
      ];
    };
  },
  Record<string, number>
>;
