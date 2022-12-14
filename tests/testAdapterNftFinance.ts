import * as anchor from "@project-serum/anchor";
import { PublicKey, Connection } from "@solana/web3.js";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { getAccount, getAssociatedTokenAddress } from "@solana/spl-token-v2";
import {
  GatewayBuilder,
  SupportedProtocols,
  LockNFTParams,
  UnlockNFTParams,
  StakeProofParams,
  UnstakeProofParams,
  ClaimParams,
} from "../src";
import { nftFinance } from "@dappio-wonderland/navigator";

describe("Gateway", () => {
  // const connection = new Connection("https://rpc-mainnet-fork.dappio.xyz", {
  //   commitment,
  //   wsEndpoint: "wss://rpc-mainnet-fork.dappio.xyz/ws",
  // });
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

  const userWallet = wallet.publicKey;
  const nftMint = new PublicKey("---------- Paste User NFT mint here --------");
  let targetInfo: {
    rarityInfo: nftFinance.NFTRarityInfo;
    poolInfo: nftFinance.NFTPoolInfo;
    farmInfo: nftFinance.NFTFarmInfo;
  };

  it("Lock NFT + Stake Proof", async () => {
    const fullInfos = await nftFinance.getFullInfo(connection);
    targetInfo = (await nftFinance.getFullInfosByMints(connection, [nftMint], fullInfos))[0] as {
      rarityInfo: nftFinance.NFTRarityInfo;
      poolInfo: nftFinance.NFTPoolInfo;
      farmInfo: nftFinance.NFTFarmInfo;
    };

    const userNftAta = await getAssociatedTokenAddress(nftMint, userWallet);

    const lockNFTParams: LockNFTParams = {
      protocol: SupportedProtocols.NftFinance,
      poolId: targetInfo.poolInfo.poolId,
      userNftAccount: [userNftAta],
    };

    const stakeProofParams: StakeProofParams = {
      protocol: SupportedProtocols.NftFinance,
      farmId: targetInfo.farmInfo.farmId,
      proveTokenAmount: 1,
    };
    const gateway = new GatewayBuilder(provider);

    await gateway.lockNFT(lockNFTParams);
    await gateway.stakeProof(stakeProofParams);

    await gateway.finalize();

    console.log(gateway.params);

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      // tx.feePayer = wallet.publicKey;
      // tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      // console.log("\n", tx.serializeMessage().toString("base64"), "\n");

      const sig = await provider.sendAndConfirm(tx as anchor.web3.Transaction, [], {
        skipPreflight: true,
        commitment: "confirmed",
      } as unknown as anchor.web3.ConfirmOptions);
      console.log(sig);
    }
    console.log("Txs are executed");
    console.log("======");
  });

  it("Unstake Proof + Unlock NFT + Claim", async () => {
    const fullInfos = await nftFinance.getFullInfo(connection);
    targetInfo = (await nftFinance.getFullInfosByMints(connection, [nftMint], fullInfos))[0] as {
      rarityInfo: nftFinance.NFTRarityInfo;
      poolInfo: nftFinance.NFTPoolInfo;
      farmInfo: nftFinance.NFTFarmInfo;
    };

    const unstakeProofParams: UnstakeProofParams = {
      protocol: SupportedProtocols.NftFinance,
      farmId: targetInfo.farmInfo.farmId,
      farmTokenAmount: 1,
    };

    const unlockNFTParams: UnlockNFTParams = {
      protocol: SupportedProtocols.NftFinance,
      poolId: targetInfo.poolInfo.poolId,
      nftMint: [nftMint],
    };

    const claimParams: ClaimParams = {
      protocol: SupportedProtocols.NftFinance,
      farmId: targetInfo.farmInfo.farmId,
      rewardTokenAmount: 100, // dummy amount
    };

    const gateway = new GatewayBuilder(provider);

    await gateway.unstakeProof(unstakeProofParams);
    await gateway.unlockNFT(unlockNFTParams);
    await gateway.claim(claimParams);

    await gateway.finalize();

    const txs = gateway.transactions();

    console.log(gateway.params);
    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      // tx.feePayer = wallet.publicKey;
      // tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      // console.log("\n", tx.serializeMessage().toString("base64"), "\n");

      const sig = await provider.sendAndConfirm(tx as anchor.web3.Transaction, [], {
        skipPreflight: true,
        commitment: "confirmed",
      } as unknown as anchor.web3.ConfirmOptions);
      console.log(sig);
    }
    console.log("Txs are executed");
    console.log("======");
  });
});
