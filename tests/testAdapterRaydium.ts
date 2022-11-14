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
import { raydium } from "@dappio-wonderland/navigator";

describe("Gateway", () => {
  // const connection = new Connection("https://rpc-mainnet-fork.epochs.studio", {
  //   commitment: "confirmed",
  //   wsEndpoint: "wss://rpc-mainnet-fork.epochs.studio/ws",
  // });
  const connection = new Connection("https://solana-api.projectserum.com", {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 180 * 1000,
  });
  // const connection = new Connection("https://solana-api.tt-prod.net", {
  //   commitment: "confirmed",
  //   confirmTransactionInitialTimeout: 180 * 1000,
  // });
  // const connection = new Connection("https://ssc-dao.genesysgo.net", {
  //   commitment: "confirmed",
  //   confirmTransactionInitialTimeout: 180 * 1000,
  // });
  // const connection = new Connection("https://api.mainnet-beta.solana.com", {
  //   commitment: "confirmed",
  //   confirmTransactionInitialTimeout: 180 * 1000,
  // });

  const options = anchor.AnchorProvider.defaultOptions();
  const wallet = NodeWallet.local();
  const provider = new anchor.AnchorProvider(connection, wallet, options);

  anchor.setProvider(provider);

  const zapInAmount = 10000;

  it("Swap + AddLiquidity + Stake in Raydium", async () => {
    const poolId = new anchor.web3.PublicKey(
      // "GaqgfieVmnmY4ZsZHHA6L5RSVzCGL3sKx4UgHBaYNy8m" // RAY-SRM
      // "AVs9TA4nWDzfPJE9gGVNJMVhcQy3V9PGazuz33BfG2RA" // RAY-WSOL
      // "DVa7Qmb5ct9RCpaU7UTpSaf3GVMYz17vNVU67XpdCRut" // RAY-USDT
      // "6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg" // RAY-USDC
      // "Enq8vJucRbkzKA1i1PahJNhMyUTzoVL5Cs8n5rC3NLGn" // GENE-USDC (Pool V4)
      // "8FrCybrh7UFznP1hVHg8kXZ8bhii37c7BGzmjkdcsGJp" // GENE-RAY (Pool V4)
      // "DPgYdwgz7ZytfrzLeRYJwXq9JGeskaXTRrM8biFEnLs1" // PRGC-USDC
      // "2N5HpqiZe2b5EKGhW1adx56chbWCAURHVqaH1gL9mppH" // GEAR-USDC
      "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2" // SOL-USDC
    );
    const farmId = new anchor.web3.PublicKey(
      // "5DFbcYNLLy5SJiBpCCDzNSs7cWCsUbYnCkLXzcPQiKnR" // RAY-SRM
      // "HUDr9BDaAGqi37xbQHzxCyXvfMCKPTPNF8g9c9bPu1Fu" // RAY-WSOL
      // "AvbVWpBi2e4C9HPmZgShGdPoNydG4Yw8GJvG9HUcLgce" // RAY-USDT
      // "CHYrUBX2RKX8iBg7gYTkccoGNBzP44LdaazMHCLcdEgS" // RAY-USDC
      // "DDRNVVJBEXEemcprVVUcrTbYnR88JyN6jjT2ypgAQHC8" // GENE-USDC (Farm V5)
      // "GVfLbXA3dpEHPvc4do9HvMZ8TACxm3x54BVrHPMEixcr" // GENE-RAY (Farm V5)
      // "GBjTMHf9TsRdMnP6S3ewAgpSoCacpZqQF1tXmnchborv" // PRGC-USDC (Farm V5)
      // "B7A3hAej7ZbAsVPM3M5ietDigQgxyucYPANJSGDVpQEw" // GEAR-USDC (Farm V5)
      "GUzaohfNuFbBqQTnPgPSNciv3aUvriXYjQduRE3ZkqFw" // SOL-USDC
    );
    const swapParams: SwapParams = {
      protocol: SupportedProtocols.Jupiter,
      fromTokenMint: new PublicKey(
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" // USDC
        // "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R" // RAY
      ),
      toTokenMint: new PublicKey(
        // "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R" // RAY
        // "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" // USDT
        // "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" // USDC
        // "SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt" // SRM
        "So11111111111111111111111111111111111111112" // WSOL
        // "GENEtH5amGSi8kHAtQoezp1XEXwZJ8vcuePYnXdKrMYz" // GENE
        // "66edZnAPEJSxnAK4SckuupssXpbu5doV57FUcghaqPsY" // PRGC
        // "7s6NLX42eURZfpyuKkVLrr9ED9hJE8718cyXFsYKqq5g" // GEAR
      ),
      amount: zapInAmount / 2, // Swap half of the fromToken to proceed zapIn
      slippage: 1,
    };
    const addLiquidityParams: AddLiquidityParams = {
      protocol: SupportedProtocols.Raydium,
      poolId,
    };
    const stakeParams: StakeParams = {
      protocol: SupportedProtocols.Raydium,
      farmId,
      version: 5,
    };

    const gateway = new GatewayBuilder(provider);

    await gateway.swap(swapParams);
    console.log(gateway.params.swapMinOutAmount.toNumber());
    // Work-around
    addLiquidityParams.tokenInAmount = gateway.params.swapMinOutAmount.toNumber();
    await gateway.addLiquidity(addLiquidityParams);
    await gateway.stake(stakeParams);

    await gateway.finalize();

    console.log(gateway.params);
    // console.log(`swapInAmount: ${gateway.params.swapInAmount}`);
    // console.log(`swapMinOutAmount: ${gateway.params.swapMinOutAmount}`);

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

  it("Unstake + Harvest + RemoveLiquidity + Swap in Raydium", async () => {
    const poolId = new anchor.web3.PublicKey(
      "GaqgfieVmnmY4ZsZHHA6L5RSVzCGL3sKx4UgHBaYNy8m" // RAY-SRM
      // "AVs9TA4nWDzfPJE9gGVNJMVhcQy3V9PGazuz33BfG2RA" // RAY-WSOL
      // "DVa7Qmb5ct9RCpaU7UTpSaf3GVMYz17vNVU67XpdCRut" // RAY-USDT
      // "6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg" // RAY-USDC
      // "Enq8vJucRbkzKA1i1PahJNhMyUTzoVL5Cs8n5rC3NLGn" // GENE-USDC (Pool V4)
      // "8FrCybrh7UFznP1hVHg8kXZ8bhii37c7BGzmjkdcsGJp" // GENE-RAY (Pool V4)
    );
    const farmId = new anchor.web3.PublicKey(
      "5DFbcYNLLy5SJiBpCCDzNSs7cWCsUbYnCkLXzcPQiKnR" // RAY-SRM
      // "HUDr9BDaAGqi37xbQHzxCyXvfMCKPTPNF8g9c9bPu1Fu" // RAY-WSOL
      // "AvbVWpBi2e4C9HPmZgShGdPoNydG4Yw8GJvG9HUcLgce" // RAY-USDT
      // "CHYrUBX2RKX8iBg7gYTkccoGNBzP44LdaazMHCLcdEgS" // RAY-USDC
      // "DDRNVVJBEXEemcprVVUcrTbYnR88JyN6jjT2ypgAQHC8" // GENE-USDC (Farm V5)
      // "GVfLbXA3dpEHPvc4do9HvMZ8TACxm3x54BVrHPMEixcr" // GENE-RAY (Farm V5)
    );

    const pool = await raydium.infos.getPool(connection, poolId);
    const poolWrapper = new raydium.PoolInfoWrapper(pool as raydium.PoolInfo);
    const farm = (await raydium.infos.getFarm(connection, farmId)) as raydium.FarmInfo;

    // Get share amount
    const ledgerKey = await raydium.infos.getFarmerId(farm, provider.wallet.publicKey, farm.version);
    const ledger = (await raydium.infos.getFarmer(connection, ledgerKey, farm.version)) as raydium.FarmerInfo;
    const shareAmount = ledger.amount as number;
    console.log(shareAmount);

    const { tokenAAmount, tokenBAmount } = await poolWrapper.getTokenAmounts(shareAmount);

    const harvestParams: HarvestParams = {
      protocol: SupportedProtocols.Raydium,
      farmId,
      version: 3,
    };
    const unstakeParams: UnstakeParams = {
      protocol: SupportedProtocols.Raydium,
      farmId,
      shareAmount,
      version: 3,
    };
    const removeLiquidityParams: RemoveLiquidityParams = {
      protocol: SupportedProtocols.Raydium,
      poolId,
    };
    const swapParams: SwapParams = {
      protocol: SupportedProtocols.Jupiter,
      fromTokenMint: new PublicKey(
        // "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" // USDC
        // "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R" // RAY
        "SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt" // SRM
        // "GENEtH5amGSi8kHAtQoezp1XEXwZJ8vcuePYnXdKrMYz" // GENE
      ),
      toTokenMint: new PublicKey(
        // "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" // USDC
        // "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" // USDT
        "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R" // RAY
        // "GENEtH5amGSi8kHAtQoezp1XEXwZJ8vcuePYnXdKrMYz" // GENE
        // "SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt" // SRM
        // "So11111111111111111111111111111111111111112" // WSOL
      ),
      amount: tokenAAmount, // swap coin to pc
      slippage: 3,
    };

    const gateway = new GatewayBuilder(provider);

    await gateway.harvest(harvestParams);
    await gateway.unstake(unstakeParams);
    await gateway.removeLiquidity(removeLiquidityParams);
    await gateway.swap(swapParams);

    await gateway.finalize();

    console.log(gateway.params);
    // console.log(`swapInAmount: ${gateway.gatewayParams.swapInAmount}`);
    // console.log(`swapMinOutAmount: ${gateway.gatewayParams.swapMinOutAmount}`);

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    // for (let tx of txs) {
    //   const sig = await provider.sendAndConfirm(tx, [], {
    //     skipPreflight: true,
    //     commitment: "confirmed",
    //   } as unknown as anchor.web3.ConfirmOptions);
    //   console.log(sig);
    // }
    console.log("Txs are executed");
    console.log("======");
  });

  it("Directly Stake and Unstake in Raydium", async () => {
    const gateway1 = new GatewayBuilder(provider);
    const poolId = new anchor.web3.PublicKey(
      "GaqgfieVmnmY4ZsZHHA6L5RSVzCGL3sKx4UgHBaYNy8m" // RAY-SRM
      // "AVs9TA4nWDzfPJE9gGVNJMVhcQy3V9PGazuz33BfG2RA" // RAY-WSOL
      // "DVa7Qmb5ct9RCpaU7UTpSaf3GVMYz17vNVU67XpdCRut" // RAY-USDT
      // "6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg" // RAY-USDC
    );
    const farmId = new anchor.web3.PublicKey(
      "5DFbcYNLLy5SJiBpCCDzNSs7cWCsUbYnCkLXzcPQiKnR" // RAY-SRM
      // "HUDr9BDaAGqi37xbQHzxCyXvfMCKPTPNF8g9c9bPu1Fu" // RAY-WSOL
      // "AvbVWpBi2e4C9HPmZgShGdPoNydG4Yw8GJvG9HUcLgce" // RAY-USDT
      // "CHYrUBX2RKX8iBg7gYTkccoGNBzP44LdaazMHCLcdEgS" // RAY-USDC
    );
    const swapParams: SwapParams = {
      protocol: SupportedProtocols.Jupiter,
      fromTokenMint: new PublicKey(
        // "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" // USDC
        "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R" // RAY
      ),
      toTokenMint: new PublicKey(
        // "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" // USDT
        "SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt" // SRM
        // "So11111111111111111111111111111111111111112" // WSOL
      ),
      amount: zapInAmount / 2, // Swap half of the fromToken to proceed zapIn
      slippage: 3,
    };
    const addLiquidityParams: AddLiquidityParams = {
      protocol: SupportedProtocols.Raydium,
      poolId,
    };

    await gateway1.swap(swapParams);
    await gateway1.addLiquidity(addLiquidityParams);

    await gateway1.finalize();

    console.log(gateway1.params);
    // console.log(`swapInAmount: ${gateway1.params.swapInAmount}`);
    // console.log(`swapMinOutAmount: ${gateway1.params.swapMinOutAmount}`);

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
    const pool = await raydium.infos.getPool(connection, poolId);
    const userLpAta = await getAssociatedTokenAddress(pool.lpMint, provider.wallet.publicKey);
    const userLpAtaAccount = await getAccount(connection, userLpAta);
    const lpAmount = new anchor.BN(userLpAtaAccount.amount.toString()).toNumber();
    console.log(lpAmount);

    // Stake
    const gateway2 = new GatewayBuilder(provider);
    const stakeParams: StakeParams = {
      protocol: SupportedProtocols.Raydium,
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

    const farm = (await raydium.infos.getFarm(connection, farmId)) as raydium.FarmInfo;
    const ledgerKey = await raydium.infos.getFarmerId(farm, provider.wallet.publicKey, farm.version);
    const ledger = await raydium.infos.getFarmer(connection, ledgerKey);
    const shareAmount = ledger.amount as number;
    console.log(shareAmount);

    const gateway3 = new GatewayBuilder(provider);
    const unstakeParams: UnstakeParams = {
      protocol: SupportedProtocols.Raydium,
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

  it("Swap (USDC => tokenA) + Swap (tokenA => tokenB) + AddLiquidity + Stake in Raydium", async () => {
    const gateway = new GatewayBuilder(provider);
    const poolId = new anchor.web3.PublicKey(
      // "GaqgfieVmnmY4ZsZHHA6L5RSVzCGL3sKx4UgHBaYNy8m" // RAY-SRM
      // "AVs9TA4nWDzfPJE9gGVNJMVhcQy3V9PGazuz33BfG2RA" // RAY-WSOL
      // "DVa7Qmb5ct9RCpaU7UTpSaf3GVMYz17vNVU67XpdCRut" // RAY-USDT
      // "6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg" // RAY-USDC
      // "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2" // SOL-USDC
      "7XawhbbxtsRcQA8KTkHT9f9nc6d69UwqCDh6U5EEbEmX" // SOL-USDT
    );
    const farmId = new anchor.web3.PublicKey(
      // "5DFbcYNLLy5SJiBpCCDzNSs7cWCsUbYnCkLXzcPQiKnR" // RAY-SRM
      // "HUDr9BDaAGqi37xbQHzxCyXvfMCKPTPNF8g9c9bPu1Fu" // RAY-WSOL
      // "AvbVWpBi2e4C9HPmZgShGdPoNydG4Yw8GJvG9HUcLgce" // RAY-USDT
      // "CHYrUBX2RKX8iBg7gYTkccoGNBzP44LdaazMHCLcdEgS" // RAY-USDC
      // "GUzaohfNuFbBqQTnPgPSNciv3aUvriXYjQduRE3ZkqFw" // SOL-USDC
      "5r878BSWPtoXgnqaeFJi7BCycKZ5CodBB2vS9SeiV8q" // SOL-USDT
    );
    const addLiquidityParams: AddLiquidityParams = {
      protocol: SupportedProtocols.Raydium,
      poolId,
    };
    const stakeParams: StakeParams = {
      protocol: SupportedProtocols.Raydium,
      farmId,
    };

    const swapParams1: SwapParams = {
      protocol: SupportedProtocols.Jupiter,
      fromTokenMint: new PublicKey(
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" // USDC
      ),
      toTokenMint: new PublicKey(
        // "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R" // RAY
        "So11111111111111111111111111111111111111112" // WSOL
      ),
      amount: zapInAmount / 2,
      slippage: 3,
    };

    await gateway.swap(swapParams1);
    const swapMinOutAmount = gateway.params.swapMinOutAmount.toNumber();

    const swapParams2: SwapParams = {
      protocol: SupportedProtocols.Jupiter,
      fromTokenMint: new PublicKey(
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" // USDC
        // "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R" // RAY
      ),
      toTokenMint: new PublicKey(
        "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" // USDT
        // "SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt" // SRM
        // "So11111111111111111111111111111111111111112" // WSOL
      ),
      amount: swapMinOutAmount / 2, // Swap half of the fromToken to proceed zapIn
      slippage: 3,
    };

    await gateway.swap(swapParams2);

    // Work-around
    addLiquidityParams.tokenInAmount = gateway.params.swapMinOutAmount.toNumber();

    await gateway.addLiquidity(addLiquidityParams);
    await gateway.stake(stakeParams);

    await gateway.finalize();

    console.log(gateway.params);
    // console.log(`swapInAmount: ${gateway.params.swapInAmount}`);
    // console.log(`swapMinOutAmount: ${gateway.params.swapMinOutAmount}`);

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
});
