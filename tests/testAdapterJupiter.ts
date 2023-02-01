import * as anchor from "@project-serum/anchor";
import { PublicKey, Connection } from "@solana/web3.js";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { GatewayBuilder, SupportedProtocols, SwapParams } from "../src";

describe("Gateway", () => {
  const connection = new Connection("https://rpc-mainnet-fork.epochs.studio", {
    commitment: "confirmed",
    wsEndpoint: "wss://rpc-mainnet-fork.epochs.studio/ws",
  });
  // const connection = new Connection("https://solana-api.projectserum.com", {
  //   commitment: "confirmed",
  //   confirmTransactionInitialTimeout: 180 * 1000,
  // });
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
  // const connection = new Connection("https://solana-mainnet.g.alchemy.com/v2/7Us4nzuUS82Z33j3AKzhUOKRA7d_TkNh", {
  //   commitment: "confirmed",
  //   wsEndpoint: "wss://solana-mainnet.g.alchemy.com/v2/7Us4nzuUS82Z33j3AKzhUOKRA7d_TkNh",
  //   confirmTransactionInitialTimeout: 180 * 1000,
  // });

  const options = anchor.AnchorProvider.defaultOptions();
  const wallet = NodeWallet.local();
  let provider = new anchor.AnchorProvider(connection, wallet, options);

  anchor.setProvider(provider);

  const zapInAmount = 1000000;

  it("Swap in Jupiter", async () => {
    const swapParams1: SwapParams = {
      protocol: SupportedProtocols.Jupiter,
      fromTokenMint: new PublicKey(
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" // USDC
        // "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R" // RAY
        // "So11111111111111111111111111111111111111112" // WSOL
        // "SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt" // SRM
        // "7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj" // stSOL
        // "2QHx6MmrsAXSKLynJ55GofBbveYaDPLvn6qgdefey5za" // GMT
        // "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE" // Orca
      ),
      toTokenMint: new PublicKey(
        // "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R" // RAY
        // "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" // USDT
        // "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" // USDC
        // "SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt" // SRM
        "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE" // Orca
        // "So11111111111111111111111111111111111111112" // WSOL
        // "GENEtH5amGSi8kHAtQoezp1XEXwZJ8vcuePYnXdKrMYz" // GENE
        // "66edZnAPEJSxnAK4SckuupssXpbu5doV57FUcghaqPsY" // PRGC
        // "7s6NLX42eURZfpyuKkVLrr9ED9hJE8718cyXFsYKqq5g" // GEAR
        // "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" // Bonk
      ),
      amount: zapInAmount, // Swap half of the fromToken to proceed zapIn
      slippage: 1,
      jupiterMarketUrl: "https://rpc-mainnet-fork.epochs.studio/jup/market.json",
    };

    const swapParams2: SwapParams = {
      protocol: SupportedProtocols.Jupiter,
      fromTokenMint: new PublicKey(
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" // USDC
        // "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R" // RAY
        // "So11111111111111111111111111111111111111112" // WSOL
        // "SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt" // SRM
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
        // "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" // Bonk
      ),
      amount: zapInAmount, // Swap half of the fromToken to proceed zapIn
      slippage: 1,
      jupiterMarketUrl: "https://rpc-mainnet-fork.epochs.studio/jup/market.json",
    };

    const gateway = new GatewayBuilder(provider);

    await gateway.swap(swapParams1);
    await gateway.swap(swapParams2);
    await gateway.finalize();

    console.log(gateway.params);
    // console.log(`swapInAmount: ${gateway.params.swapInAmount}`);
    // console.log(`swapMinOutAmount: ${gateway.params.swapMinOutAmount}`);

    const txs = await gateway.v0Transactions();
    console.log(txs);

    console.log("======");
    console.log("Txs are sent...");
    const recentBlockhash = await connection.getLatestBlockhash();
    for (let tx of txs) {
      tx.message.recentBlockhash = recentBlockhash.blockhash;
      console.log(tx.serialize().length);
      tx.sign([wallet.payer]);
      let versionMessage = tx.serialize();
      //const result = sendAndConfirmTransaction(connection, tx, wallet);
      const sig = await connection.sendRawTransaction(versionMessage, {
        skipPreflight: true,
        commitment: "confirmed",
      } as unknown as anchor.web3.ConfirmOptions);
      console.log(sig);
    }
    console.log("Txs are executed");
    console.log("======");
  });
});
