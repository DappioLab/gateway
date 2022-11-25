import * as anchor from "@project-serum/anchor";
import { PublicKey, Connection } from "@solana/web3.js";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { getAccount, getAssociatedTokenAddress } from "@solana/spl-token-v2";
import {
  AddLiquidityParams,
  StakeParams,
  GatewayBuilder,
  SupportedProtocols,
  SwapParams,
  UnstakeParams,
  RemoveLiquidityParams,
  HarvestParams,
} from "../src";
import { saber } from "@dappio-wonderland/navigator";

describe("Gateway", () => {
  const connection = new Connection("https://rpc-mainnet-fork.epochs.studio", {
    commitment: "confirmed",
    wsEndpoint: "wss://rpc-mainnet-fork.epochs.studio/ws",
  });
  // const connection = new Connection("https://solana-api.tt-prod.net", {
  //   commitment: "confirmed",
  //   confirmTransactionInitialTimeout: 180 * 1000,
  // });
  // const connection = new Connection("https://ssc-dao.genesysgo.net", {
  //   commitment: "confirmed",
  //   confirmTransactionInitialTimeout: 180 * 1000,
  // });
  // const connection = new Connection("https:////api.mainnet-beta.solana.com", {
  //   commitment: "confirmed",
  //   confirmTransactionInitialTimeout: 180 * 1000,
  // });

  const options = anchor.AnchorProvider.defaultOptions();
  const wallet = NodeWallet.local();
  const provider = new anchor.AnchorProvider(connection, wallet, options);

  anchor.setProvider(provider);

  const zapInAmount = 100;

  it("AddLiquidity (Single side) + Stake in Saber", async () => {
    const poolId = new anchor.web3.PublicKey(
      "YAkoNb6HKmSxQN9L8hiBE5tPJRsniSSMzND1boHmZxe" // USDC-USDT
    );
    const farmId = new anchor.web3.PublicKey(
      "Hs1X5YtXwZACueUtS9azZyXFDWVxAMLvm3tttubpK7ph" // USDC-USDT
    );

    const gateway = new GatewayBuilder(provider);
    const addLiquidityParams: AddLiquidityParams = {
      protocol: SupportedProtocols.Saber,
      poolId,
      tokenInAmount: zapInAmount,
      tokenMint: new anchor.web3.PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    };
    const stakeParams: StakeParams = {
      protocol: SupportedProtocols.Saber,
      farmId,
    };

    await gateway.addLiquidity(addLiquidityParams);
    await gateway.stake(stakeParams);

    await gateway.finalize();

    console.log(gateway.params);

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      const sig = await provider.sendAndConfirm(tx, [], {
        skipPreflight: true,
        commitment: "confirmed",
      } as unknown as anchor.web3.ConfirmOptions);
      console.log(sig);
    }
    console.log("Txs are executed");
    console.log("======");
  });

  // it("AddLiquidity (Dual sides) + Stake in Saber", async () => {
  //   const poolId = new anchor.web3.PublicKey(
  //     "YAkoNb6HKmSxQN9L8hiBE5tPJRsniSSMzND1boHmZxe" // USDC-USDT
  //   );
  //   const farmId = new anchor.web3.PublicKey(
  //     "Hs1X5YtXwZACueUtS9azZyXFDWVxAMLvm3tttubpK7ph" // USDC-USDT
  //   );

  //   const gateway = new GatewayBuilder(provider);
  //   const addLiquidityParams: AddLiquidityParams = {
  //     protocol: SupportedProtocols.Saber,
  //     poolId,
  //     tokenAInAmount: zapInAmount / 2,
  //     tokenBInAmount: zapInAmount / 2,
  //   };
  //   const stakeParams: StakeParams = {
  //     protocol: SupportedProtocols.Saber,
  //     farmId,
  //   };

  //   await gateway.addLiquidity(addLiquidityParams);
  //   await gateway.stake(stakeParams);

  //   await gateway.finalize();

  //   console.log(gateway.params);

  //   const txs = gateway.transactions();

  //   console.log("======");
  //   console.log("Txs are sent...");
  //   for (let tx of txs) {
  //     const sig = await provider.sendAndConfirm(tx, [], {
  //       skipPreflight: false,
  //       commitment: "confirmed",
  //     } as unknown as anchor.web3.ConfirmOptions);
  //     console.log(sig);
  //   }
  //   console.log("Txs are executed");
  //   console.log("======");
  // });

  it("Unstake + Harvest + RemoveLiquidity (Single side) in Saber", async () => {
    const poolId = new anchor.web3.PublicKey(
      "YAkoNb6HKmSxQN9L8hiBE5tPJRsniSSMzND1boHmZxe" // USDC-USDT
    );
    const farmId = new anchor.web3.PublicKey(
      "Hs1X5YtXwZACueUtS9azZyXFDWVxAMLvm3tttubpK7ph" // USDC-USDT
    );

    const gateway = new GatewayBuilder(provider);

    // Get share amount
    const minerKey = await saber.infos.getFarmerId(
      await saber.infos.getFarm(connection, farmId),
      provider.wallet.publicKey
    );
    const miner = await saber.infos.getFarmer(connection, minerKey);
    const shareAmount = miner.amount as number;

    console.log(shareAmount);

    const harvestParams: HarvestParams = {
      protocol: SupportedProtocols.Saber,
      farmId,
    };
    const unstakeParams: UnstakeParams = {
      protocol: SupportedProtocols.Saber,
      farmId,
      shareAmount: shareAmount / 2,
    };
    const removeLiquidityParams: RemoveLiquidityParams = {
      protocol: SupportedProtocols.Saber,
      poolId,
      singleToTokenMint: new anchor.web3.PublicKey(
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" // USDC
      ),
    };

    await gateway.harvest(harvestParams);
    await gateway.unstake(unstakeParams);
    await gateway.removeLiquidity(removeLiquidityParams);

    await gateway.finalize();

    console.log(gateway.params);

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      const sig = await provider.sendAndConfirm(tx, [], {
        skipPreflight: true,
        commitment: "confirmed",
      } as unknown as anchor.web3.ConfirmOptions);
      console.log(sig);
    }
    console.log("Txs are executed");
    console.log("======");
  });

  // it("Unstake + Harvest + RemoveLiquidity (Dual sides) in Saber", async () => {
  //   const poolId = new anchor.web3.PublicKey(
  //     "YAkoNb6HKmSxQN9L8hiBE5tPJRsniSSMzND1boHmZxe" // USDC-USDT
  //   );
  //   const farmId = new anchor.web3.PublicKey(
  //     "Hs1X5YtXwZACueUtS9azZyXFDWVxAMLvm3tttubpK7ph" // USDC-USDT
  //   );

  //   const gateway = new GatewayBuilder(provider);

  //   // Get share amount
  //   const minerKey = await saber.getMinerKey(provider.wallet.publicKey, farmId);
  //   const miner = await saber.getMiner(connection, minerKey);
  //   const shareAmount = miner.amount;

  //   console.log(shareAmount);

  //   const harvestParams: HarvestParams = {
  //     protocol: SupportedProtocols.Saber,
  //     farmId,
  //   };
  //   const unstakeParams: UnstakeParams = {
  //     protocol: SupportedProtocols.Saber,
  //     farmId,
  //     shareAmount,
  //   };
  //   const removeLiquidityParams: RemoveLiquidityParams = {
  //     protocol: SupportedProtocols.Saber,
  //     poolId,
  //   };

  //   await gateway.harvest(harvestParams);
  //   await gateway.unstake(unstakeParams);
  //   await gateway.removeLiquidity(removeLiquidityParams);

  //   await gateway.finalize();

  //   console.log(gateway.params);

  //   const txs = gateway.transactions();

  //   console.log("======");
  //   console.log("Txs are sent...");
  //   for (let tx of txs) {
  //     const sig = await provider.sendAndConfirm(tx, [], {
  //       skipPreflight: true,
  //       commitment: "confirmed",
  //     } as unknown as anchor.web3.ConfirmOptions);
  //     console.log(sig);
  //   }
  //   console.log("Txs are executed");
  //   console.log("======");
  // });

  it("Directly Stake and Unstake in Saber", async () => {
    const poolId = new anchor.web3.PublicKey(
      "YAkoNb6HKmSxQN9L8hiBE5tPJRsniSSMzND1boHmZxe" // USDC-USDT
    );
    const farmId = new anchor.web3.PublicKey(
      "Hs1X5YtXwZACueUtS9azZyXFDWVxAMLvm3tttubpK7ph" // USDC-USDT
    );

    const gateway1 = new GatewayBuilder(provider);

    const addLiquidityParams: AddLiquidityParams = {
      protocol: SupportedProtocols.Saber,
      poolId,
      tokenInAmount: zapInAmount,
      tokenMint: new anchor.web3.PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    };

    await gateway1.addLiquidity(addLiquidityParams);

    await gateway1.finalize();

    console.log(gateway1.params);

    const txs1 = gateway1.transactions();

    console.log("======");
    console.log("Txs are sent...");
    // for (let tx of txs1) {
    //   const sig = await provider.sendAndConfirm(tx, [], {
    //     skipPreflight: true,
    //     commitment: "confirmed",
    //   } as unknown as anchor.web3.ConfirmOptions);
    //   console.log(sig);
    // }
    console.log("Txs are executed");
    console.log("======");

    // Get LP amount
    const pool = await saber.infos.getPool(connection, poolId);
    const userLpAta = await getAssociatedTokenAddress(pool.lpMint, provider.wallet.publicKey);
    const userLpAtaAccount = await getAccount(connection, userLpAta);
    const lpAmount = new anchor.BN(userLpAtaAccount.amount.toString()).toNumber();
    console.log(lpAmount);

    // Stake
    const gateway2 = new GatewayBuilder(provider);
    const stakeParams: StakeParams = {
      protocol: SupportedProtocols.Saber,
      farmId,
      lpAmount,
    };

    await gateway2.stake(stakeParams);
    await gateway2.finalize();

    const txs2 = gateway2.transactions();

    console.log(gateway2.params);

    console.log("======");
    console.log("Txs are sent...");
    // for (let tx of txs2) {
    //   const sig = await provider.sendAndConfirm(tx, [], {
    //     skipPreflight: true,
    //     commitment: "confirmed",
    //   } as unknown as anchor.web3.ConfirmOptions);
    //   console.log(sig);
    // }
    console.log("Txs are executed");
    console.log("======");

    // Get share amount

    const minerKey = await saber.infos.getFarmerId(
      await saber.infos.getFarm(connection, farmId),
      provider.wallet.publicKey
    );
    const miner = await saber.infos.getFarmer(connection, minerKey);
    const shareAmount = miner.amount as number;
    console.log(shareAmount);

    const gateway3 = new GatewayBuilder(provider);
    const unstakeParams: UnstakeParams = {
      protocol: SupportedProtocols.Saber,
      farmId,
      shareAmount: shareAmount / 2, // Unstake only half
    };

    await gateway3.unstake(unstakeParams);
    await gateway3.finalize();

    const txs3 = gateway3.transactions();

    console.log(gateway3.params);

    console.log("======");
    console.log("Txs are sent...");
    // for (let tx of txs3) {
    //   const sig = await provider.sendAndConfirm(tx, [], {
    //     skipPreflight: true,
    //     commitment: "confirmed",
    //   } as unknown as anchor.web3.ConfirmOptions);
    //   console.log(sig);
    // }
    console.log("Txs are executed");
    console.log("======");
  });

  it("Swap (USDC => tokenA) + AddLiquidity (Single side) + Stake in Saber", async () => {
    const poolId = new anchor.web3.PublicKey(
      // "YAkoNb6HKmSxQN9L8hiBE5tPJRsniSSMzND1boHmZxe" // USDC-USDT
      "Lee1XZJfJ9Hm2K1qTyeCz1LXNc1YBZaKZszvNY4KCDw" // mSOL-SOL
      // "AyiATPCAx5HZstcZ1jdH9rENwFb3yd9zEhkgspvDrCs4" // renBTC-pBTC
    );
    const farmId = new anchor.web3.PublicKey(
      // "Hs1X5YtXwZACueUtS9azZyXFDWVxAMLvm3tttubpK7ph" // USDC-USDT
      "7193EeecxsPPv9TMoQATTN8i1eTqEUSNU8aDLuFCQy68" // mSOL-SOL
      // "8hnBtfEumuBh8Vd19qZ16re6wWgMZypZQoFLum7vx1bf" // renBTC-pBTC
    );

    const gateway = new GatewayBuilder(provider);

    const swapParams: SwapParams = {
      protocol: SupportedProtocols.Jupiter,
      fromTokenMint: new PublicKey(
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" // USDC
        // "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" // USDT
      ),
      toTokenMint: new PublicKey(
        // "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" // USDT
        // "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" // USDC
        // "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R" // RAY
        "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So" // mSOL
        // "CDJWUqTcYTVAKXAVXoQZFes5JUFc7owSeq7eMQcDSbo5" // renBTC
        // "DYDWu4hE4MN3aH897xQ3sRTs5EAjJDmQsKLNhbpUiKun" // pBTC
      ),
      amount: zapInAmount,
      slippage: 3,
    };

    await gateway.swap(swapParams);

    const addLiquidityParams: AddLiquidityParams = {
      protocol: SupportedProtocols.Saber,
      poolId,
    };
    const stakeParams: StakeParams = {
      protocol: SupportedProtocols.Saber,
      farmId,
    };

    await gateway.addLiquidity(addLiquidityParams);
    await gateway.stake(stakeParams);

    await gateway.finalize();

    console.log(gateway.params);

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    // for (let tx of txs) {
    //   const sig = await provider.sendAndConfirm(tx, [], {
    //     skipPreflight: false,
    //     commitment: "confirmed",
    //   } as unknown as anchor.web3.ConfirmOptions);
    //   console.log(sig);
    // }
    console.log("Txs are executed");
    console.log("======");
  });
});
