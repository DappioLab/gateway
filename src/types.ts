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

export interface IProtocolSwap {
  swap: () => void;
  getSwapMinOutAmount: () => void;
}

export interface IProtocolPool {
  addLiquidity: (
    pool: IPoolInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<anchor.web3.Transaction[]>;
  removeLiquidity: (
    pool: IPoolInfo,
    userKey: anchor.web3.PublicKey,
    singleToTokenMint?: anchor.web3.PublicKey
  ) => Promise<anchor.web3.Transaction[]>;
}

export interface IProtocolNFTPool {
  lockNFT: (
    pool: INFTPoolInfo,
    userKey: anchor.web3.PublicKey,
    userNftMint?: anchor.web3.PublicKey[]
  ) => Promise<anchor.web3.Transaction[]>;
  unlockNFT: (
    pool: INFTPoolInfo,
    userKey: anchor.web3.PublicKey,
    nftMint?: anchor.web3.PublicKey[]
  ) => Promise<anchor.web3.Transaction[]>;
}

export interface IProtocolFarm {
  stake: (
    farm: IFarmInfo,
    userKey: anchor.web3.PublicKey,
    farmerKey?: anchor.web3.PublicKey
  ) => Promise<anchor.web3.Transaction[]>;
  unstake: (
    farm: IFarmInfo,
    userKey: anchor.web3.PublicKey,
    farmerKey?: anchor.web3.PublicKey
  ) => Promise<anchor.web3.Transaction[]>;
  harvest: (
    farm: IFarmInfo,
    userKey: anchor.web3.PublicKey,
    farmerKey?: anchor.web3.PublicKey
  ) => Promise<anchor.web3.Transaction[]>;
}

export interface IProtocolNFTFarm {
  stakeProof: (
    farm: INFTFarmInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<anchor.web3.Transaction[]>;
  unstakeProof: (
    farm: INFTFarmInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<anchor.web3.Transaction[]>;
  claim: (
    farm: INFTFarmInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<anchor.web3.Transaction[]>;
}

export interface IProtocolMoneyMarket {
  supply: (
    reserve: IReserveInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<anchor.web3.Transaction[]>;
  collateralize: (
    reserve: IReserveInfo,
    userKey: anchor.web3.PublicKey,
    obligationKey?: anchor.web3.PublicKey
  ) => Promise<anchor.web3.Transaction[]>;
  unsupply: (
    reserve: IReserveInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<anchor.web3.Transaction[]>;
  uncollateralize: (
    reserve: IReserveInfo,
    userKey: anchor.web3.PublicKey,
    obligationKey?: anchor.web3.PublicKey
  ) => Promise<anchor.web3.Transaction[]>;
  borrow?: (
    reserve: IReserveInfo,
    userKey: anchor.web3.PublicKey,
    obligationKey?: anchor.web3.PublicKey
  ) => Promise<anchor.web3.Transaction[]>;
  repay?: (
    reserve: IReserveInfo,
    userKey: anchor.web3.PublicKey,
    obligationKey?: anchor.web3.PublicKey
  ) => Promise<anchor.web3.Transaction[]>;
  claimCollateralReward?: (
    userKey: anchor.web3.PublicKey,
    obligationKey?: anchor.web3.PublicKey
  ) => Promise<anchor.web3.Transaction[]>;
}

export interface IProtocolVault {
  deposit?: (
    vaultId: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<anchor.web3.Transaction[]>;
  withdraw?: (
    vaultId: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<anchor.web3.Transaction[]>;
  initiateWithdrawal?: (
    vaultId: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<anchor.web3.Transaction[]>;
  initiateDeposit?: (
    vaultId: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<anchor.web3.Transaction[]>;
  finalizeDeposit?: (
    vaultId: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<anchor.web3.Transaction[]>;
  cancelDeposit?: (
    vaultId: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<anchor.web3.Transaction[]>;
  finalizeWithdrawal?: (
    vaultId: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<anchor.web3.Transaction[]>;
  cancelWithdrawal?: (
    vaultId: IVaultInfo,
    userKey: anchor.web3.PublicKey
  ) => Promise<anchor.web3.Transaction[]>;
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
