import * as anchor from "@project-serum/anchor";
import { struct, u8, u64 } from "@project-serum/borsh";
import {
  IFarmInfo,
  IPoolInfo,
  larix,
  lifinity,
  raydium,
  saber,
  solend,
  orca,
  francium,
  tulip,
  nftFinance,
  katana,
  friktion,
} from "@dappio-wonderland/navigator";
import {
  ActionType,
  AddLiquidityParams,
  BorrowParams,
  ClaimCollateralRewardParams,
  ClaimParams,
  CollateralizeParams,
  DepositParams,
  GatewayMetadata,
  GatewayParams,
  HarvestParams,
  IProtocolFarm,
  IProtocolMoneyMarket,
  IProtocolNFTFarm,
  IProtocolNFTPool,
  IProtocolPool,
  IProtocolVault,
  LockNFTParams,
  PoolDirection,
  RemoveLiquidityParams,
  RepayParams,
  RouteInfoExtend,
  StakeParams,
  StakeProofParams,
  SupplyParams,
  SupportedProtocols,
  SwapParams,
  UncollateralizeParams,
  UnlockNFTParams,
  UnstakeParams,
  UnstakeProofParams,
  UnsupplyParams,
  WithdrawParams,
} from "./types";
import { GATEWAY_PROGRAM_ID } from "./ids";
import { Gateway, GatewayIDL } from "@dappio-wonderland/gateway-idls";
import { ProtocolJupiter } from "./protocols/jupiter";
import { ProtocolRaydium } from "./protocols/raydium";
import { ProtocolSaber } from "./protocols/saber";
import { ProtocolOrca } from "./protocols/orca";
import { ProtocolSolend } from "./protocols/solend";
import { ProtocolLarix } from "./protocols/larix";
import { ProtocolLifinity } from "./protocols/lifinity";
import { ProtocolNftFinance } from "./protocols/nftFinance";
import { ProtocolFrancium } from "./protocols/francium";
import { ProtocolKatana } from "./protocols/katana";
import { ProtocolTulip } from "./protocols/tulip";
import { ProtocolFriktion } from "./protocols/friktion";

export class GatewayBuilder {
  public params: GatewayParams;
  private _metadata: GatewayMetadata;
  private _program: anchor.Program<Gateway>;
  private _stateSeed: anchor.BN;
  private _transactions: anchor.web3.Transaction[] = [];

  // # Use Cases of PoolDirection in Different Scenarios (In/Out)
  //
  // |           -           | Obverse | Reverse |
  // |           -           |    -    |    -    |
  // |   Swap and Add (In)   |    1    |    2    |
  // |       Add (In)        |    3    |    4    |
  // | Remove and Swap (Out) |    5    |    6    |
  //
  // 1. Determine the amount of A: A -> B, B could be less (slippage), so use amount of B to calculate A, there might be some dust of A left
  // 2. Determine the amount of B: B -> A, A could be less (slippage), so use amount of A to calculate B, there might be some dust of B left
  // 3. Determine addLiquidityTokenMint: Use B as addLiquidityTokenMint
  // 4. Determine addLiquidityTokenMint: Use A as addLiquidityTokenMint
  // 5. Determine fromMint and toMint: Use A as fromMint and B as toMint
  // 6. Determine fromMint and toMint: Use B as fromMint and A as toMint

  constructor(private _provider: anchor.AnchorProvider) {
    this._program = new anchor.Program(
      GatewayIDL,
      GATEWAY_PROGRAM_ID,
      this._provider
    );
    this._stateSeed = new anchor.BN(Math.floor(Math.random() * 100000000));

    // Default params
    this.params = {
      version: 1,
      currentIndex: 0,
      queueSize: 0,
      protocolQueue: [], // ex: [Jupiter, Raydium, Raydium]
      actionQueue: [], // ex: [Swap, AddLiquidity, Deposit]
      // CAUTION: It is very risky to accept versions passed in since the called might forget to change
      versionQueue: [], // ex: [0, 3, 2].
      payloadQueue: [], // ex: [1000, 1200, 400000]
      poolDirection: PoolDirection.Obverse,
      swapMinOutAmount: new anchor.BN(0),

      // WIP: Multiple I/O
      payloadQueue2: [] as Uint8Array[], // ex: [1000, 1200, 400000]
      inputIndexQueue: [],
    };

    this._metadata = {
      pool: null as IPoolInfo,
      farm: null as IFarmInfo,
      fromTokenMint: null as anchor.web3.PublicKey,
      toTokenMint: null as anchor.web3.PublicKey,
    };
  }

  async getGatewayStateKey(): Promise<anchor.web3.PublicKey> {
    const [gatewayStateAccount, _bump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from(anchor.utils.bytes.utf8.encode("gateway")),
          this._stateSeed.toArrayLike(Buffer, "le", 8),
        ],
        GATEWAY_PROGRAM_ID
      );

    return gatewayStateAccount;
  }

  // IProtocolSwap
  async swap(swapParams: SwapParams): Promise<GatewayBuilder> {
    // NOTE: No need to push protocol / action to queue since Jupiter apapter is not implemented yet
    this._metadata.fromTokenMint = swapParams.fromTokenMint;
    this._metadata.toTokenMint = swapParams.toTokenMint;

    this._adjustParams();

    // TODO: Move the logic into protocols
    switch (swapParams.protocol) {
      case SupportedProtocols.Jupiter:
        const protocol = new ProtocolJupiter(this._provider.connection, {
          ...swapParams,
          userKey: this._provider.wallet.publicKey,
        });

        // Jupiter only
        await protocol.build();
        const swapMinOutAmount = protocol.getSwapMinOutAmount();
        this.params.swapMinOutAmount = new anchor.BN(swapMinOutAmount);
        this._metadata.routes = Boolean(this._metadata.routes)
          ? [...this._metadata.routes, await protocol.getRoute()]
          : [await protocol.getRoute()];

        this._transactions = [
          ...this._transactions,
          ...(await protocol.swap()),
        ];

        break;
      default:
        throw new Error("Unsupported Protocol");
    }

    return this;
  }

  // IProtocolPool
  async addLiquidity(
    addLiquidityParams: AddLiquidityParams
  ): Promise<GatewayBuilder> {
    this.params.actionQueue.push(ActionType.AddLiquidity);
    this.params.protocolQueue.push(addLiquidityParams.protocol);
    this.params.versionQueue.push(addLiquidityParams.version || 1);
    this.params.payloadQueue.push(
      new anchor.BN(addLiquidityParams.tokenInAmount)
    );
    this._metadata.addLiquidityTokenMint = addLiquidityParams.tokenMint;

    let protocol: IProtocolPool;

    switch (addLiquidityParams.protocol) {
      case SupportedProtocols.Raydium:
        this._metadata.pool = await raydium.infos.getPool(
          this._provider.connection,
          addLiquidityParams.poolId
        );

        protocol = new ProtocolRaydium(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      case SupportedProtocols.Saber:
        this._metadata.pool = await saber.infos.getPool(
          this._provider.connection,
          addLiquidityParams.poolId
        );

        protocol = new ProtocolSaber(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      case SupportedProtocols.Lifinity:
        this._metadata.pool = await lifinity.infos.getPool(
          this._provider.connection,
          addLiquidityParams.poolId
        );

        protocol = new ProtocolLifinity(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      case SupportedProtocols.Orca:
        this._metadata.pool = await orca.infos.getPool(
          this._provider.connection,
          addLiquidityParams.poolId
        );
        protocol = new ProtocolOrca(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );
        break;
      default:
        throw new Error("Unsupported Protocol");
    }

    this._adjustParams();

    // NOTICE:
    // Ideally gateway params should be the only one single source of truth
    // However input params are necessary in some circustances. Ex: WSOL, input payload, etc
    // Need to pass params as argument
    const { txs, input } = await protocol.addLiquidity(
      addLiquidityParams,
      this._metadata.pool,
      this._provider.wallet.publicKey
    );

    // Push input payload
    (this.params.payloadQueue2 as Uint8Array[]).push(input);
    // TODO: Extract the logic of index dispatch to a config file
    this.params.inputIndexQueue.push(0);

    this._transactions = [...this._transactions, ...txs];

    return this;
  }

  // IProtocolPool
  async removeLiquidity(
    removeLiquidityParams: RemoveLiquidityParams
  ): Promise<GatewayBuilder> {
    this.params.actionQueue.push(
      removeLiquidityParams.singleToTokenMint
        ? ActionType.RemoveLiquiditySingle
        : ActionType.RemoveLiquidity
    );
    this.params.protocolQueue.push(removeLiquidityParams.protocol);
    this.params.versionQueue.push(removeLiquidityParams.version || 1);
    this.params.payloadQueue.push(
      new anchor.BN(new anchor.BN(removeLiquidityParams.lpAmount))
    );

    let protocol: IProtocolPool;

    switch (removeLiquidityParams.protocol) {
      case SupportedProtocols.Raydium:
        this._metadata.pool = await raydium.infos.getPool(
          this._provider.connection,
          removeLiquidityParams.poolId
        );

        protocol = new ProtocolRaydium(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      case SupportedProtocols.Saber:
        this._metadata.pool = await saber.infos.getPool(
          this._provider.connection,
          removeLiquidityParams.poolId
        );

        this._metadata.removeLiquiditySingleToTokenMint =
          removeLiquidityParams.singleToTokenMint;

        protocol = new ProtocolSaber(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      case SupportedProtocols.Lifinity:
        this._metadata.pool = await lifinity.infos.getPool(
          this._provider.connection,
          removeLiquidityParams.poolId
        );

        protocol = new ProtocolLifinity(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      case SupportedProtocols.Orca:
        this._metadata.pool = await orca.infos.getPool(
          this._provider.connection,
          removeLiquidityParams.poolId
        );
        this._metadata.removeLiquiditySingleToTokenMint =
          removeLiquidityParams.singleToTokenMint;
        protocol = new ProtocolOrca(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      default:
        throw new Error("Unsupported Protocol");
    }

    this._adjustParams();

    // NOTICE:
    // Ideally gateway params should be the only one single source of truth
    // However input params are necessary in some circustances. Ex: WSOL, input payload, etc
    // Need to pass params as argument
    const { txs, input } = await protocol.removeLiquidity(
      removeLiquidityParams,
      this._metadata.pool,
      this._provider.wallet.publicKey,
      this._metadata.removeLiquiditySingleToTokenMint
    );

    // Push input payload
    (this.params.payloadQueue2 as Uint8Array[]).push(input);
    // TODO: Extract the logic of index dispatch to a config file
    this.params.inputIndexQueue.push(0);

    this._transactions = [...this._transactions, ...txs];

    return this;
  }

  // IProtocolFarm
  async stake(stakeParams: StakeParams): Promise<GatewayBuilder> {
    this.params.actionQueue.push(ActionType.Stake);
    this.params.protocolQueue.push(stakeParams.protocol);
    this.params.versionQueue.push(stakeParams.version || 1);
    this.params.payloadQueue.push(new anchor.BN(stakeParams.lpAmount));

    let protocol: IProtocolFarm;

    switch (stakeParams.protocol) {
      case SupportedProtocols.Raydium:
        this._metadata.farm = await raydium.infos.getFarm(
          this._provider.connection,
          stakeParams.farmId
        );

        protocol = new ProtocolRaydium(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      case SupportedProtocols.Saber:
        this._metadata.farm = await saber.infos.getFarm(
          this._provider.connection,
          stakeParams.farmId
        );

        protocol = new ProtocolSaber(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      case SupportedProtocols.Orca:
        this._metadata.farm = await orca.infos.getFarm(
          this._provider.connection,
          stakeParams.farmId
        );
        protocol = new ProtocolOrca(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );
        break;
      case SupportedProtocols.Larix:
        this._metadata.farm = await larix.infos.getFarm(
          this._provider.connection,
          stakeParams.farmId
        );
        protocol = new ProtocolLarix(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );
        break;
      case SupportedProtocols.Francium:
        this._metadata.farm = await francium.infos.getFarm(
          this._provider.connection,
          stakeParams.farmId
        );

        protocol = new ProtocolFrancium(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      default:
        throw new Error("Unsupported Protocol");
    }

    this._adjustParams();

    // NOTICE:
    // Ideally gateway params should be the only one single source of truth
    // However input params are necessary in some circustances. Ex: WSOL, input payload, etc
    // Need to pass params as argument
    const { txs, input } = await protocol.stake(
      stakeParams,
      this._metadata.farm,
      this._provider.wallet.publicKey,
      stakeParams.farmerKey // TODO: Remove duplication
    );

    // Push input payload
    (this.params.payloadQueue2 as Uint8Array[]).push(input);
    // TODO: Extract the logic of index dispatch to a config file
    this.params.inputIndexQueue.push(0);

    this._transactions = [...this._transactions, ...txs];

    return this;
  }

  // IProtocolFarm
  async unstake(unstakeParams: UnstakeParams): Promise<GatewayBuilder> {
    this.params.actionQueue.push(ActionType.Unstake);
    this.params.protocolQueue.push(unstakeParams.protocol);
    this.params.versionQueue.push(unstakeParams.version || 1);
    this.params.payloadQueue.push(new anchor.BN(unstakeParams.shareAmount));

    let protocol: IProtocolFarm;

    switch (unstakeParams.protocol) {
      case SupportedProtocols.Raydium:
        this._metadata.farm = await raydium.infos.getFarm(
          this._provider.connection,
          unstakeParams.farmId
        );

        protocol = new ProtocolRaydium(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      case SupportedProtocols.Saber:
        this._metadata.farm = await saber.infos.getFarm(
          this._provider.connection,
          unstakeParams.farmId
        );

        protocol = new ProtocolSaber(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      case SupportedProtocols.Orca:
        this._metadata.farm = await orca.infos.getFarm(
          this._provider.connection,
          unstakeParams.farmId
        );
        protocol = new ProtocolOrca(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );
        break;
      case SupportedProtocols.Larix:
        this._metadata.farm = await larix.infos.getFarm(
          this._provider.connection,
          unstakeParams.farmId
        );
        protocol = new ProtocolLarix(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );
        break;
      case SupportedProtocols.Francium:
        this._metadata.farm = await francium.infos.getFarm(
          this._provider.connection,
          unstakeParams.farmId
        );

        protocol = new ProtocolFrancium(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      default:
        throw new Error("Unsupported Protocol");
    }

    this._adjustParams();

    // NOTICE:
    // Ideally gateway params should be the only one single source of truth
    // However input params are necessary in some circustances. Ex: WSOL, input payload, etc
    // Need to pass params as argument
    const { txs, input } = await protocol.unstake(
      unstakeParams,
      this._metadata.farm,
      this._provider.wallet.publicKey,
      unstakeParams.farmerKey
    );

    // Push input payload
    (this.params.payloadQueue2 as Uint8Array[]).push(input);
    // TODO: Extract the logic of index dispatch to a config file
    this.params.inputIndexQueue.push(0);

    this._transactions = [...this._transactions, ...txs];

    return this;
  }

  // IProtocolFarm
  async harvest(harvestParams: HarvestParams): Promise<GatewayBuilder> {
    this.params.actionQueue.push(ActionType.Harvest);
    this.params.protocolQueue.push(harvestParams.protocol);
    this.params.versionQueue.push(harvestParams.version || 1);

    let protocol: IProtocolFarm;

    switch (harvestParams.protocol) {
      case SupportedProtocols.Raydium:
        this._metadata.farm = await raydium.infos.getFarm(
          this._provider.connection,
          harvestParams.farmId
        );

        protocol = new ProtocolRaydium(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      case SupportedProtocols.Saber:
        this._metadata.farm = await saber.infos.getFarm(
          this._provider.connection,
          harvestParams.farmId
        );

        protocol = new ProtocolSaber(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      case SupportedProtocols.Orca:
        this._metadata.farm = await orca.infos.getFarm(
          this._provider.connection,
          harvestParams.farmId
        );
        protocol = new ProtocolOrca(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );
        break;
      case SupportedProtocols.Larix:
        this._metadata.farm = await larix.infos.getFarm(
          this._provider.connection,
          harvestParams.farmId
        );
        protocol = new ProtocolLarix(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );
        break;
      default:
        throw new Error("Unsupported Protocol");
    }

    this._adjustParams();

    // NOTICE:
    // Ideally gateway params should be the only one single source of truth
    // However input params are necessary in some circustances. Ex: WSOL, input payload, etc
    // Need to pass params as argument
    const { txs, input } = await protocol.harvest(
      harvestParams,
      this._metadata.farm,
      this._provider.wallet.publicKey,
      harvestParams.farmerKey
    );

    // Push input payload
    (this.params.payloadQueue2 as Uint8Array[]).push(input);
    // TODO: Extract the logic of index dispatch to a config file
    this.params.inputIndexQueue.push(0);

    this._transactions = [...this._transactions, ...txs];

    return this;
  }

  // IProtocolMoneyMarket
  async supply(supplyParams: SupplyParams): Promise<GatewayBuilder> {
    this.params.actionQueue.push(ActionType.Supply);
    this.params.protocolQueue.push(supplyParams.protocol);
    this.params.versionQueue.push(supplyParams.version || 1);
    this.params.payloadQueue.push(new anchor.BN(supplyParams.supplyAmount));

    let protocol: IProtocolMoneyMarket;

    switch (supplyParams.protocol) {
      case SupportedProtocols.Solend:
        this._metadata.reserve = await solend.infos.getReserve(
          this._provider.connection,
          supplyParams.reserveId
        );

        protocol = new ProtocolSolend(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      case SupportedProtocols.Larix:
        this._metadata.reserve = await larix.infos.getReserve(
          this._provider.connection,
          supplyParams.reserveId
        );

        protocol = new ProtocolLarix(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      case SupportedProtocols.Francium:
        this._metadata.reserve = await francium.infos.getReserve(
          this._provider.connection,
          supplyParams.reserveId
        );

        protocol = new ProtocolFrancium(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      case SupportedProtocols.Tulip:
        this._metadata.reserve = await tulip.infos.getReserve(
          this._provider.connection,
          supplyParams.reserveId
        );

        protocol = new ProtocolTulip(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      default:
        throw new Error("Unsupported Protocol");
    }

    this._adjustParams();

    // NOTICE:
    // Ideally gateway params should be the only one single source of truth
    // However input params are necessary in some circustances. Ex: WSOL, input payload, etc
    // Need to pass params as argument
    const { txs, input } = await protocol.supply(
      supplyParams,
      this._metadata.reserve,
      this._provider.wallet.publicKey
    );

    // Push input payload
    (this.params.payloadQueue2 as Uint8Array[]).push(input);
    // TODO: Extract the logic of index dispatch to a config file
    this.params.inputIndexQueue.push(0);

    this._transactions = [...this._transactions, ...txs];

    return this;
  }

  // IProtocolMoneyMarket
  async collateralize(
    collateralizeParams: CollateralizeParams
  ): Promise<GatewayBuilder> {
    this.params.actionQueue.push(ActionType.Collateralize);
    this.params.protocolQueue.push(collateralizeParams.protocol);
    this.params.versionQueue.push(collateralizeParams.version || 1);
    this.params.payloadQueue.push(
      new anchor.BN(collateralizeParams.collateralizeAmount)
    );

    let protocol: IProtocolMoneyMarket;

    switch (collateralizeParams.protocol) {
      case SupportedProtocols.Solend:
        this._metadata.reserve = await solend.infos.getReserve(
          this._provider.connection,
          collateralizeParams.reserveId
        );

        protocol = new ProtocolSolend(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      case SupportedProtocols.Larix:
        this._metadata.reserve = await larix.infos.getReserve(
          this._provider.connection,
          collateralizeParams.reserveId
        );

        protocol = new ProtocolLarix(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      default:
        throw new Error("Unsupported Protocol");
    }

    this._adjustParams();

    // NOTICE:
    // Ideally gateway params should be the only one single source of truth
    // However input params are necessary in some circustances. Ex: WSOL, input payload, etc
    // Need to pass params as argument
    const { txs, input } = await protocol.collateralize(
      collateralizeParams,
      this._metadata.reserve,
      this._provider.wallet.publicKey,
      collateralizeParams.obligationKey
    );

    // Push input payload
    (this.params.payloadQueue2 as Uint8Array[]).push(input);
    // TODO: Extract the logic of index dispatch to a config file
    this.params.inputIndexQueue.push(0);

    this._transactions = [...this._transactions, ...txs];

    return this;
  }

  // IProtocolMoneyMarket
  async unsupply(unsupplyParams: UnsupplyParams): Promise<GatewayBuilder> {
    this.params.actionQueue.push(ActionType.Unsupply);
    this.params.protocolQueue.push(unsupplyParams.protocol);
    this.params.versionQueue.push(unsupplyParams.version || 1);
    this.params.payloadQueue.push(new anchor.BN(unsupplyParams.reservedAmount));

    let protocol: IProtocolMoneyMarket;

    switch (unsupplyParams.protocol) {
      case SupportedProtocols.Solend:
        this._metadata.reserve = await solend.infos.getReserve(
          this._provider.connection,
          unsupplyParams.reserveId
        );

        protocol = new ProtocolSolend(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      case SupportedProtocols.Larix:
        this._metadata.reserve = await larix.infos.getReserve(
          this._provider.connection,
          unsupplyParams.reserveId
        );

        protocol = new ProtocolLarix(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;

      case SupportedProtocols.Francium:
        this._metadata.reserve = await francium.infos.getReserve(
          this._provider.connection,
          unsupplyParams.reserveId
        );

        protocol = new ProtocolFrancium(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      case SupportedProtocols.Tulip:
        this._metadata.reserve = await tulip.infos.getReserve(
          this._provider.connection,
          unsupplyParams.reserveId
        );

        protocol = new ProtocolTulip(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      default:
        throw new Error("Unsupported Protocol");
    }

    this._adjustParams();

    // NOTICE:
    // Ideally gateway params should be the only one single source of truth
    // However input params are necessary in some circustances. Ex: WSOL, input payload, etc
    // Need to pass params as argument
    const { txs, input } = await protocol.unsupply(
      unsupplyParams,
      this._metadata.reserve,
      this._provider.wallet.publicKey
    );

    // Push input payload
    (this.params.payloadQueue2 as Uint8Array[]).push(input);
    // TODO: Extract the logic of index dispatch to a config file
    this.params.inputIndexQueue.push(0);

    this._transactions = [...this._transactions, ...txs];

    return this;
  }

  // IProtocolMoneyMarket
  async uncollateralize(
    uncollateralizeParams: UncollateralizeParams
  ): Promise<GatewayBuilder> {
    this.params.actionQueue.push(ActionType.Uncollateralize);
    this.params.protocolQueue.push(uncollateralizeParams.protocol);
    this.params.versionQueue.push(uncollateralizeParams.version || 1);
    this.params.payloadQueue.push(
      new anchor.BN(uncollateralizeParams.uncollateralizeAmount)
    );

    let protocol: IProtocolMoneyMarket;

    switch (uncollateralizeParams.protocol) {
      case SupportedProtocols.Solend:
        this._metadata.reserve = await solend.infos.getReserve(
          this._provider.connection,
          uncollateralizeParams.reserveId
        );

        protocol = new ProtocolSolend(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      case SupportedProtocols.Larix:
        this._metadata.reserve = await larix.infos.getReserve(
          this._provider.connection,
          uncollateralizeParams.reserveId
        );

        protocol = new ProtocolLarix(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      default:
        throw new Error("Unsupported Protocol");
    }

    this._adjustParams();

    // NOTICE:
    // Ideally gateway params should be the only one single source of truth
    // However input params are necessary in some circustances. Ex: WSOL, input payload, etc
    // Need to pass params as argument
    const { txs, input } = await protocol.uncollateralize(
      uncollateralizeParams,
      this._metadata.reserve,
      this._provider.wallet.publicKey,
      uncollateralizeParams.obligationKey
    );

    // Push input payload
    (this.params.payloadQueue2 as Uint8Array[]).push(input);
    // TODO: Extract the logic of index dispatch to a config file
    this.params.inputIndexQueue.push(0);

    this._transactions = [...this._transactions, ...txs];

    return this;
  }

  // IProtocolMoneyMarket
  async borrow(borrowParams: BorrowParams): Promise<GatewayBuilder> {
    this.params.actionQueue.push(ActionType.Borrow);
    this.params.protocolQueue.push(borrowParams.protocol);
    this.params.versionQueue.push(borrowParams.version || 1);
    this.params.payloadQueue.push(new anchor.BN(borrowParams.borrowAmount));

    let protocol: IProtocolMoneyMarket;

    switch (borrowParams.protocol) {
      case SupportedProtocols.Solend:
        this._metadata.reserve = await solend.infos.getReserve(
          this._provider.connection,
          borrowParams.reserveId
        );

        protocol = new ProtocolSolend(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      case SupportedProtocols.Larix:
        this._metadata.reserve = await larix.infos.getReserve(
          this._provider.connection,
          borrowParams.reserveId
        );

        protocol = new ProtocolLarix(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      default:
        throw new Error("Unsupported Protocol");
    }

    this._adjustParams();

    // NOTICE:
    // Ideally gateway params should be the only one single source of truth
    // However input params are necessary in some circustances. Ex: WSOL, input payload, etc
    // Need to pass params as argument
    const { txs, input } = await protocol.borrow(
      borrowParams,
      this._metadata.reserve,
      this._provider.wallet.publicKey
    );

    // Push input payload
    (this.params.payloadQueue2 as Uint8Array[]).push(input);
    // TODO: Extract the logic of index dispatch to a config file
    this.params.inputIndexQueue.push(0);

    this._transactions = [...this._transactions, ...txs];

    return this;
  }

  // IProtocolMoneyMarket
  async repay(repayParams: RepayParams): Promise<GatewayBuilder> {
    this.params.actionQueue.push(ActionType.Repay);
    this.params.protocolQueue.push(repayParams.protocol);
    this.params.versionQueue.push(repayParams.version || 1);
    this.params.payloadQueue.push(new anchor.BN(repayParams.repayAmount));

    let protocol: IProtocolMoneyMarket;

    switch (repayParams.protocol) {
      case SupportedProtocols.Solend:
        this._metadata.reserve = await solend.infos.getReserve(
          this._provider.connection,
          repayParams.reserveId
        );

        protocol = new ProtocolSolend(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      case SupportedProtocols.Larix:
        this._metadata.reserve = await larix.infos.getReserve(
          this._provider.connection,
          repayParams.reserveId
        );

        protocol = new ProtocolLarix(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      default:
        throw new Error("Unsupported Protocol");
    }

    this._adjustParams();

    // NOTICE:
    // Ideally gateway params should be the only one single source of truth
    // However input params are necessary in some circustances. Ex: WSOL, input payload, etc
    // Need to pass params as argument
    const { txs, input } = await protocol.repay(
      repayParams,
      this._metadata.reserve,
      this._provider.wallet.publicKey
    );

    // Push input payload
    (this.params.payloadQueue2 as Uint8Array[]).push(input);
    // TODO: Extract the logic of index dispatch to a config file
    this.params.inputIndexQueue.push(0);

    this._transactions = [...this._transactions, ...txs];

    return this;
  }

  // IProtocolMoneyMarket
  async claimCollateralReward(
    claimCollateralRewardParams: ClaimCollateralRewardParams
  ): Promise<GatewayBuilder> {
    this.params.actionQueue.push(ActionType.ClaimCollateralReward);
    this.params.protocolQueue.push(claimCollateralRewardParams.protocol);
    this.params.versionQueue.push(claimCollateralRewardParams.version || 1);

    let protocol: IProtocolMoneyMarket;

    switch (claimCollateralRewardParams.protocol) {
      case SupportedProtocols.Solend:
        protocol = new ProtocolSolend(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      case SupportedProtocols.Larix:
        protocol = new ProtocolLarix(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      default:
        throw new Error("Unsupported Protocol");
    }

    this._adjustParams();

    // NOTICE:
    // Ideally gateway params should be the only one single source of truth
    // However input params are necessary in some circustances. Ex: WSOL, input payload, etc
    // Need to pass params as argument
    const { txs, input } = await protocol.claimCollateralReward(
      claimCollateralRewardParams,
      this._provider.wallet.publicKey,
      claimCollateralRewardParams.obligationKey
    );

    // Push input payload
    (this.params.payloadQueue2 as Uint8Array[]).push(input);
    // TODO: Extract the logic of index dispatch to a config file
    this.params.inputIndexQueue.push(0);

    this._transactions = [...this._transactions, ...txs];

    return this;
  }

  // IProtocolVault
  async deposit(depositParams: DepositParams): Promise<GatewayBuilder> {
    this.params.actionQueue.push(ActionType.Deposit);
    this.params.protocolQueue.push(depositParams.protocol);
    this.params.versionQueue.push(depositParams.version || 1);
    this.params.payloadQueue.push(new anchor.BN(depositParams.depositAmount));

    let protocol: IProtocolVault;

    switch (depositParams.protocol) {
      case SupportedProtocols.Tulip:
        this._metadata.vault = await tulip.infos.getVault(
          this._provider.connection,
          depositParams.vaultId
        );

        protocol = new ProtocolTulip(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      case SupportedProtocols.Katana:
        this._metadata.vault = await katana.infos.getVault(
          this._provider.connection,
          depositParams.vaultId
        );
        protocol = new ProtocolKatana(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;

      case SupportedProtocols.Friktion:
        this._metadata.vault = await friktion.infos.getVault(
          this._provider.connection,
          depositParams.vaultId
        );
        protocol = new ProtocolFriktion(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      default:
        throw new Error("Unsupported Protocol");
    }

    this._adjustParams();

    // NOTICE:
    // Ideally gateway params should be the only one single source of truth
    // However input params are necessary in some circustances. Ex: WSOL, input payload, etc
    // Need to pass params as argument
    const { txs, input } = await protocol.deposit(
      depositParams,
      this._metadata.vault,
      this._provider.wallet.publicKey
    );

    // Push input payload
    (this.params.payloadQueue2 as Uint8Array[]).push(input);
    // TODO: Extract the logic of index dispatch to a config file
    this.params.inputIndexQueue.push(0);

    this._transactions = [...this._transactions, ...txs];

    return this;
  }
  async initiateDeposit(depositParams: DepositParams): Promise<GatewayBuilder> {
    this.params.actionQueue.push(ActionType.InitiateDeposit);
    this.params.protocolQueue.push(depositParams.protocol);
    this.params.versionQueue.push(depositParams.version || 1);
    this.params.payloadQueue.push(new anchor.BN(depositParams.depositAmount));

    let protocol: IProtocolVault;

    switch (depositParams.protocol) {
      case SupportedProtocols.Friktion:
        this._metadata.vault = await friktion.infos.getVault(
          this._provider.connection,
          depositParams.vaultId
        );
        protocol = new ProtocolFriktion(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      default:
        throw new Error("Unsupported Protocol");
    }

    this._adjustParams();

    // NOTICE:
    // Ideally gateway params should be the only one single source of truth
    // However input params are necessary in some circustances. Ex: WSOL, input payload, etc
    // Need to pass params as argument
    const { txs, input } = await protocol.initiateDeposit(
      depositParams,
      this._metadata.vault,
      this._provider.wallet.publicKey
    );

    // Push input payload
    (this.params.payloadQueue2 as Uint8Array[]).push(input);
    // TODO: Extract the logic of index dispatch to a config file
    this.params.inputIndexQueue.push(0);

    this._transactions = [...this._transactions, ...txs];

    return this;
  }

  // IProtocolVault
  async withdraw(withdrawParams: WithdrawParams): Promise<GatewayBuilder> {
    this.params.actionQueue.push(ActionType.Withdraw);
    this.params.protocolQueue.push(withdrawParams.protocol);
    this.params.versionQueue.push(withdrawParams.version || 1);
    this.params.payloadQueue.push(new anchor.BN(withdrawParams.withdrawAmount));

    let protocol: IProtocolVault;

    switch (withdrawParams.protocol) {
      case SupportedProtocols.Tulip:
        this._metadata.vault = await tulip.infos.getVault(
          this._provider.connection,
          withdrawParams.vaultId
        );

        protocol = new ProtocolTulip(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;

      default:
        throw new Error("Unsupported Protocol");
    }

    this._adjustParams();

    // NOTICE:
    // Ideally gateway params should be the only one single source of truth
    // However input params are necessary in some circustances. Ex: WSOL, input payload, etc
    // Need to pass params as argument
    const { txs, input } = await protocol.withdraw(
      withdrawParams,
      this._metadata.vault,
      this._provider.wallet.publicKey
    );

    // Push input payload
    (this.params.payloadQueue2 as Uint8Array[]).push(input);
    // TODO: Extract the logic of index dispatch to a config file
    this.params.inputIndexQueue.push(0);

    this._transactions = [...this._transactions, ...txs];

    return this;
  }
  async initiateWithdrawal(
    withdrawParams: WithdrawParams
  ): Promise<GatewayBuilder> {
    this.params.actionQueue.push(ActionType.InitiateWithdrawal);

    this.params.protocolQueue.push(withdrawParams.protocol);
    this.params.versionQueue.push(withdrawParams.version || 1);
    this.params.payloadQueue.push(new anchor.BN(withdrawParams.withdrawAmount));

    let protocol: IProtocolVault;

    switch (withdrawParams.protocol) {
      case SupportedProtocols.Friktion:
        this._metadata.vault = await friktion.infos.getVault(
          this._provider.connection,
          withdrawParams.vaultId
        );
        protocol = new ProtocolFriktion(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );
        break;
      default:
        throw new Error("Unsupported Protocol");
    }

    this._adjustParams();

    // NOTICE:
    // Ideally gateway params should be the only one single source of truth
    // However input params are necessary in some circustances. Ex: WSOL, input payload, etc
    // Need to pass params as argument
    const { txs, input } = await protocol.initiateWithdrawal(
      withdrawParams,
      this._metadata.vault,
      this._provider.wallet.publicKey
    );

    // Push input payload
    (this.params.payloadQueue2 as Uint8Array[]).push(input);
    // TODO: Extract the logic of index dispatch to a config file
    this.params.inputIndexQueue.push(0);

    this._transactions = [...this._transactions, ...txs];

    return this;
  }
  async finalizeDeposit(
    withdrawParams: WithdrawParams
  ): Promise<GatewayBuilder> {
    this.params.actionQueue.push(ActionType.FinalizeDeposit);

    this.params.protocolQueue.push(withdrawParams.protocol);
    this.params.versionQueue.push(withdrawParams.version || 1);
    this.params.payloadQueue.push(new anchor.BN(withdrawParams.withdrawAmount));

    let protocol: IProtocolVault;

    switch (withdrawParams.protocol) {
      case SupportedProtocols.Friktion:
        this._metadata.vault = await friktion.infos.getVault(
          this._provider.connection,
          withdrawParams.vaultId
        );
        protocol = new ProtocolFriktion(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );
        break;
      default:
        throw new Error("Unsupported Protocol");
    }

    this._adjustParams();

    // NOTICE:
    // Ideally gateway params should be the only one single source of truth
    // However input params are necessary in some circustances. Ex: WSOL, input payload, etc
    // Need to pass params as argument
    const { txs, input } = await protocol.finalizeDeposit(
      withdrawParams,
      this._metadata.vault,
      this._provider.wallet.publicKey
    );

    // Push input payload
    (this.params.payloadQueue2 as Uint8Array[]).push(input);
    // TODO: Extract the logic of index dispatch to a config file
    this.params.inputIndexQueue.push(0);

    this._transactions = [...this._transactions, ...txs];

    return this;
  }
  async cancelDeposit(withdrawParams: WithdrawParams): Promise<GatewayBuilder> {
    this.params.actionQueue.push(ActionType.CancelDeposit);

    this.params.protocolQueue.push(withdrawParams.protocol);
    this.params.versionQueue.push(withdrawParams.version || 1);
    this.params.payloadQueue.push(new anchor.BN(withdrawParams.withdrawAmount));

    let protocol: IProtocolVault;

    switch (withdrawParams.protocol) {
      case SupportedProtocols.Friktion:
        this._metadata.vault = await friktion.infos.getVault(
          this._provider.connection,
          withdrawParams.vaultId
        );
        protocol = new ProtocolFriktion(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );
        break;
      default:
        throw new Error("Unsupported Protocol");
    }

    this._adjustParams();

    // NOTICE:
    // Ideally gateway params should be the only one single source of truth
    // However input params are necessary in some circustances. Ex: WSOL, input payload, etc
    // Need to pass params as argument
    const { txs, input } = await protocol.cancelDeposit(
      withdrawParams,
      this._metadata.vault,
      this._provider.wallet.publicKey
    );

    // Push input payload
    (this.params.payloadQueue2 as Uint8Array[]).push(input);
    // TODO: Extract the logic of index dispatch to a config file
    this.params.inputIndexQueue.push(0);

    this._transactions = [...this._transactions, ...txs];

    return this;
  }
  async finalizeWithdrawal(
    withdrawParams: WithdrawParams
  ): Promise<GatewayBuilder> {
    this.params.actionQueue.push(ActionType.FinalizeWithdrawal);

    this.params.protocolQueue.push(withdrawParams.protocol);
    this.params.versionQueue.push(withdrawParams.version || 1);
    this.params.payloadQueue.push(new anchor.BN(withdrawParams.withdrawAmount));

    let protocol: IProtocolVault;

    switch (withdrawParams.protocol) {
      case SupportedProtocols.Friktion:
        this._metadata.vault = await friktion.infos.getVault(
          this._provider.connection,
          withdrawParams.vaultId
        );
        protocol = new ProtocolFriktion(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );
        break;
      default:
        throw new Error("Unsupported Protocol");
    }

    this._adjustParams();

    // NOTICE:
    // Ideally gateway params should be the only one single source of truth
    // However input params are necessary in some circustances. Ex: WSOL, input payload, etc
    // Need to pass params as argument
    const { txs, input } = await protocol.finalizeWithdrawal(
      withdrawParams,
      this._metadata.vault,
      this._provider.wallet.publicKey
    );

    // Push input payload
    (this.params.payloadQueue2 as Uint8Array[]).push(input);
    // TODO: Extract the logic of index dispatch to a config file
    this.params.inputIndexQueue.push(0);

    this._transactions = [...this._transactions, ...txs];

    return this;
  }
  async cancelWithdrawal(
    withdrawParams: WithdrawParams
  ): Promise<GatewayBuilder> {
    this.params.actionQueue.push(ActionType.CancelWithdrawal);

    this.params.protocolQueue.push(withdrawParams.protocol);
    this.params.versionQueue.push(withdrawParams.version || 1);
    this.params.payloadQueue.push(new anchor.BN(withdrawParams.withdrawAmount));

    let protocol: IProtocolVault;

    switch (withdrawParams.protocol) {
      case SupportedProtocols.Friktion:
        this._metadata.vault = await friktion.infos.getVault(
          this._provider.connection,
          withdrawParams.vaultId
        );
        protocol = new ProtocolFriktion(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );
        break;
      default:
        throw new Error("Unsupported Protocol");
    }

    this._adjustParams();

    // NOTICE:
    // Ideally gateway params should be the only one single source of truth
    // However input params are necessary in some circustances. Ex: WSOL, input payload, etc
    // Need to pass params as argument
    const { txs, input } = await protocol.cancelWithdrawal(
      withdrawParams,
      this._metadata.vault,
      this._provider.wallet.publicKey
    );

    // Push input payload
    (this.params.payloadQueue2 as Uint8Array[]).push(input);
    // TODO: Extract the logic of index dispatch to a config file
    this.params.inputIndexQueue.push(0);

    this._transactions = [...this._transactions, ...txs];

    return this;
  }

  // IProtocolNFTPool
  async lockNFT(lockNFTParams: LockNFTParams): Promise<GatewayBuilder> {
    this.params.actionQueue.push(ActionType.LockNft);
    this.params.protocolQueue.push(lockNFTParams.protocol);
    this.params.versionQueue.push(lockNFTParams.version || 1);
    this.params.payloadQueue.push(new anchor.BN(1));

    let protocol: IProtocolNFTPool;

    switch (lockNFTParams.protocol) {
      case SupportedProtocols.NftFinance:
        this._metadata.nftPool = await nftFinance.infos.getPool(
          this._provider.connection,
          lockNFTParams.poolId
        );

        protocol = new ProtocolNftFinance(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      default:
        throw new Error("Unsupported Protocol");
    }

    this._adjustParams();

    // NOTICE:
    // Ideally gateway params should be the only one single source of truth
    // However input params are necessary in some circustances. Ex: WSOL, input payload, etc
    // Need to pass params as argument
    const { txs, input } = await protocol.lockNFT(
      lockNFTParams,
      this._metadata.nftPool,
      this._provider.wallet.publicKey,
      lockNFTParams.userNftAccount
    );

    // Push input payload
    (this.params.payloadQueue2 as Uint8Array[]).push(input);
    // TODO: Extract the logic of index dispatch to a config file
    this.params.inputIndexQueue.push(0);

    this._transactions = [...this._transactions, ...txs];

    return this;
  }

  // IProtocolNFTPool
  async unlockNFT(unlockNFTParams: UnlockNFTParams): Promise<GatewayBuilder> {
    this.params.actionQueue.push(ActionType.UnlockNft);
    this.params.protocolQueue.push(unlockNFTParams.protocol);
    this.params.versionQueue.push(unlockNFTParams.version || 1);
    this.params.payloadQueue.push(new anchor.BN(1));

    let protocol: IProtocolNFTPool;

    switch (unlockNFTParams.protocol) {
      case SupportedProtocols.NftFinance:
        this._metadata.nftPool = await nftFinance.infos.getPool(
          this._provider.connection,
          unlockNFTParams.poolId
        );

        protocol = new ProtocolNftFinance(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      default:
        throw new Error("Unsupported Protocol");
    }

    this._adjustParams();

    // NOTICE:
    // Ideally gateway params should be the only one single source of truth
    // However input params are necessary in some circustances. Ex: WSOL, input payload, etc
    // Need to pass params as argument
    const { txs, input } = await protocol.unlockNFT(
      unlockNFTParams,
      this._metadata.nftPool,
      this._provider.wallet.publicKey,
      unlockNFTParams.nftMint
    );

    // Push input payload
    (this.params.payloadQueue2 as Uint8Array[]).push(input);
    // TODO: Extract the logic of index dispatch to a config file
    this.params.inputIndexQueue.push(0);

    this._transactions = [...this._transactions, ...txs];

    return this;
  }

  // IProtocolNFTFarm
  async stakeProof(
    stakeProofParams: StakeProofParams
  ): Promise<GatewayBuilder> {
    this.params.actionQueue.push(ActionType.StakeProof);
    this.params.protocolQueue.push(stakeProofParams.protocol);
    this.params.versionQueue.push(stakeProofParams.version || 1);
    this.params.payloadQueue.push(
      new anchor.BN(stakeProofParams.proveTokenAmount)
    );

    let protocol: IProtocolNFTFarm;

    switch (stakeProofParams.protocol) {
      case SupportedProtocols.NftFinance:
        this._metadata.nftFarm = await nftFinance.infos.getFarm(
          this._provider.connection,
          stakeProofParams.farmId
        );

        protocol = new ProtocolNftFinance(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      default:
        throw new Error("Unsupported Protocol");
    }

    this._adjustParams();

    // NOTICE:
    // Ideally gateway params should be the only one single source of truth
    // However input params are necessary in some circustances. Ex: WSOL, input payload, etc
    // Need to pass params as argument
    const { txs, input } = await protocol.stakeProof(
      stakeProofParams,
      this._metadata.nftFarm,
      this._provider.wallet.publicKey
    );

    // Push input payload
    (this.params.payloadQueue2 as Uint8Array[]).push(input);
    // TODO: Extract the logic of index dispatch to a config file
    this.params.inputIndexQueue.push(0);

    this._transactions = [...this._transactions, ...txs];

    return this;
  }

  // IProtocolNFTFarm
  async unstakeProof(
    unstakeProofParams: UnstakeProofParams
  ): Promise<GatewayBuilder> {
    this.params.actionQueue.push(ActionType.UnstakeProof);
    this.params.protocolQueue.push(unstakeProofParams.protocol);
    this.params.versionQueue.push(unstakeProofParams.version || 1);
    this.params.payloadQueue.push(
      new anchor.BN(unstakeProofParams.farmTokenAmount)
    );

    let protocol: IProtocolNFTFarm;

    switch (unstakeProofParams.protocol) {
      case SupportedProtocols.NftFinance:
        this._metadata.nftFarm = await nftFinance.infos.getFarm(
          this._provider.connection,
          unstakeProofParams.farmId
        );

        protocol = new ProtocolNftFinance(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      default:
        throw new Error("Unsupported Protocol");
    }

    this._adjustParams();

    // NOTICE:
    // Ideally gateway params should be the only one single source of truth
    // However input params are necessary in some circustances. Ex: WSOL, input payload, etc
    // Need to pass params as argument
    const { txs, input } = await protocol.unstakeProof(
      unstakeProofParams,
      this._metadata.nftFarm,
      this._provider.wallet.publicKey
    );

    // Push input payload
    (this.params.payloadQueue2 as Uint8Array[]).push(input);
    // TODO: Extract the logic of index dispatch to a config file
    this.params.inputIndexQueue.push(0);

    this._transactions = [...this._transactions, ...txs];

    return this;
  }

  // IProtocolNFTFarm
  async claim(claimParams: ClaimParams): Promise<GatewayBuilder> {
    this.params.actionQueue.push(ActionType.Claim);
    this.params.protocolQueue.push(claimParams.protocol);
    this.params.versionQueue.push(claimParams.version || 1);
    this.params.payloadQueue.push(new anchor.BN(claimParams.rewardTokenAmount));

    let protocol: IProtocolNFTFarm;

    switch (claimParams.protocol) {
      case SupportedProtocols.NftFinance:
        this._metadata.nftFarm = await nftFinance.infos.getFarm(
          this._provider.connection,
          claimParams.farmId
        );

        protocol = new ProtocolNftFinance(
          this._provider.connection,
          this._program,
          await this.getGatewayStateKey(),
          this.params
        );

        break;
      default:
        throw new Error("Unsupported Protocol");
    }

    this._adjustParams();

    // NOTICE:
    // Ideally gateway params should be the only one single source of truth
    // However input params are necessary in some circustances. Ex: WSOL, input payload, etc
    // Need to pass params as argument
    const { txs, input } = await protocol.claim(
      claimParams,
      this._metadata.nftFarm,
      this._provider.wallet.publicKey
    );

    // Push input payload
    (this.params.payloadQueue2 as Uint8Array[]).push(input);
    // TODO: Extract the logic of index dispatch to a config file
    this.params.inputIndexQueue.push(0);

    this._transactions = [...this._transactions, ...txs];

    return this;
  }

  private _adjustParams() {
    this.params.queueSize = this.params.protocolQueue.length;

    // Determine poolDirection
    // 1. From fromTokenMint
    if (this._metadata?.fromTokenMint) {
      this.params.poolDirection = this._metadata.pool?.tokenAMint?.equals(
        this._metadata?.fromTokenMint
      )
        ? PoolDirection.Obverse
        : PoolDirection.Reverse;
    } else {
      // 2. From addLiquidityTokenMint
      // NOTE: only when `fromTokenMint` is null (meaning no swap)
      if (this._metadata?.addLiquidityTokenMint) {
        this.params.poolDirection = this._metadata.pool?.tokenAMint?.equals(
          this._metadata?.addLiquidityTokenMint
        )
          ? PoolDirection.Reverse // tokenA is the input token
          : PoolDirection.Obverse; // tokenB is the input token
      }
    }

    // ZapIn only: Update poolTokenAInAmount if swapOutAmount has value
    if (this.params?.swapMinOutAmount?.toNumber() > 0) {
      const indexAddLiquidity = this.params.actionQueue.indexOf(
        ActionType.AddLiquidity
      );
      // Note: ZapIn only
      if (indexAddLiquidity > 0) {
        switch (this.params.poolDirection) {
          case PoolDirection.Obverse:
            this.params.payloadQueue[indexAddLiquidity] = new anchor.BN(
              this.params.swapMinOutAmount.toNumber()
            );
            break;
          case PoolDirection.Reverse:
            this.params.payloadQueue[indexAddLiquidity] = new anchor.BN(
              this.params.swapMinOutAmount.toNumber()
            );
            break;
        }
      }
    }
  }

  async finalize(): Promise<GatewayBuilder> {
    this._adjustParams();

    // TODO: Check if all params are valid

    let preInstructions: anchor.web3.TransactionInstruction[] = [];

    const txInit = await this._program.methods
      .initialize(this.params, this._stateSeed)
      .accounts({
        gatewayState: await this.getGatewayStateKey(),
        authority: this._provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .preInstructions(preInstructions)
      .transaction();

    const txClose = await this._program.methods
      .close()
      .accounts({
        gatewayState: await this.getGatewayStateKey(),
        payer: this._provider.wallet.publicKey,
      })
      .transaction();

    this._transactions = [txInit, ...this._transactions, txClose];

    return this;
  }

  transactions(): anchor.web3.Transaction[] {
    return this._transactions;
  }

  getRoutes(): RouteInfoExtend[] {
    return this._metadata.routes;
  }
}
