import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { NftaasMarketplace } from "../target/types/nftaas_marketplace";
import { TOKEN_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import { createSignerFromKeypair, signerIdentity } from "@metaplex-foundation/umi";
import { assert } from "chai";
import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { SYSTEM_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/native/system";

describe("nftaas-marketplace", () => {
  //Configure the client to use the env cluster and establish connection
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;

  const program = anchor.workspace.NftaasMarketplace as Program<NftaasMarketplace>;
  
  const wallet = provider.wallet as anchor.Wallet

  // Metaplex Constants
  const METADATA_SEED = "metadata";
  const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
  const EDITION_SEED = "edition";
  
  // Constants from the program
  const MAKRETPLACE_SEED = "marketplace";
  const marketplace_name = "Test3 Marketplace";
  const MINT_SEED = "mint";
 
  // Data for testing
  let lister_uri: string = "https://example.com/lister_uri";
  let uri_seed: string;
  let metadata: {
    name: string,
    symbol: string,
    uri: string,
    decimals: number
  };
  let destination: PublicKey;

  const listing_price = 0.005;
  const mintAmount = 1;

  // Keypair for testing purposes only
  const customer = Keypair.fromSecretKey(new Uint8Array(
    [92,66,35,199,7,141,174,204,177,158,163,101,
      125,227,148,121,4,16,120,93,146,29,71,65,184,
      205,9,194,170,49,35,30,207,34,177,23,205,74,21,
      161,232,41,70,122,6,72,176,137,9,29,220,32,55,149,
      182,13,15,36,132,13,67,239,65,181]));

  // PDAs which will be updated dynamically within the testing
  let mint: PublicKey;
  let metadataAddress: PublicKey;
  let editionAddress: PublicKey;

  // Derive marketplace PDA for validation if it exists
  const [marketplace] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(MAKRETPLACE_SEED),
      Buffer.from(marketplace_name),
    ],
    program.programId
  );

  it("It initializes a Marketplace!", async () => {
    // Check if a marketplace with the same seeds already exists
    const info = await connection.getAccountInfo(marketplace);

    if(info){
      console.log("\n   Marketplace found!");
      console.log("   It has already been initialized.");
      console.log("   Marketplace Address: ", marketplace);

      // Do not attempt to initialize if it already exist.
      return; 
    }

    const tx = await program.methods
      .initialize(marketplace_name, 2)
      .accounts({
        admin: wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID
      })
      .rpc();

    const latestBlockHash = await connection.getLatestBlockhash()
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: tx,
    });

    console.log("\n   Marketplace Initialized!");
  });

  it("Create a URI with NFT Lister's description", async () => {
    //Create a umi devnet connection
    const umi = createUmi('https://api.devnet.solana.com');

    let keypair = umi.eddsa.createKeypairFromSecretKey(wallet.payer.secretKey);
    const signer = createSignerFromKeypair(umi, keypair);

    umi.use(irysUploader());
    umi.use(signerIdentity(signer));

    try{
      // Image of the NFT
      const image = "https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Leslie_Lamport.jpg/220px-Leslie_Lamport.jpg";
      
      // Description of the Service NFT
      const description = "I would edit out your videos for you to use as a content";

      const metadata = {
          name: "Service NFT",
          symbol: "SNFT",
          description: description,
          image: image,
          attributes: [
              {
                  trait_type: 'Category', value: 'Service',
                  
              }
          ],
          properties: {
              files: [
                  {
                      type: "image/jpg",
                      uri: image
                  },
              ]
          },
          creators: []
        };

        const myUri = await umi.uploader.uploadJson(metadata);

        // Update the lister URI with the newly created URI
        lister_uri = myUri;

        // Extract the first 20 characters after the base URI
        uri_seed = lister_uri.replace("https://arweave.net/", "").slice(0, 25);

        console.log("\n   URI Seed: ", uri_seed);

        // Derive mint and metadata addresses with the new URI seed
        [mint] = PublicKey.findProgramAddressSync(
          [
            Buffer.from(MINT_SEED),
            Buffer.from(uri_seed),
          ],
          program.programId
        );

        [metadataAddress] = PublicKey.findProgramAddressSync(
          [
            Buffer.from(METADATA_SEED),
            TOKEN_METADATA_PROGRAM_ID.toBuffer(),
            mint.toBuffer(),
          ],
          TOKEN_METADATA_PROGRAM_ID
        );
  
        [editionAddress] = PublicKey.findProgramAddressSync(
          [
            Buffer.from(METADATA_SEED),
            TOKEN_METADATA_PROGRAM_ID.toBuffer(),
            mint.toBuffer(),
            Buffer.from(EDITION_SEED),
          ],
          TOKEN_METADATA_PROGRAM_ID
        );

        console.log("   Your NFT URI: ", myUri);
    }
    catch(error) {
        console.log("Oops.. Something went wrong", error);
    }
  });

  it("It initializes NFT Metadata then Mints the NFT to the lister's ATA account", async () => {

    metadata = {
      name: "Just a Test Token",
      symbol: "TEST",
      uri: lister_uri,
      decimals: 0,
    };

    const info = await connection.getAccountInfo(mint);

    if (info) {
      console.log("\n   Mint found! No need to initialize.");
      console.log("   Mint Address: ", mint)
      return; // Do not attempt to initialize if already initialized
    }

    console.log("\n   Mint not found. Attempting to initialize.");

    destination = await getAssociatedTokenAddressSync(
      mint,
      wallet.publicKey,
    );

    let initialBalance: number;

    try {
      const balance = (await connection.getTokenAccountBalance(destination))
      initialBalance = balance.value.uiAmount;
    } catch {
      // Token account not yet initiated has 0 balance
      initialBalance = 0;
    } 

    const txHash = await program.methods
      .mintNft(metadata, uri_seed, new BN(mintAmount * 10 ** metadata.decimals))
      .accounts({
        metadata: metadataAddress,
        payer: wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const latestBlockHash = await connection.getLatestBlockhash()
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: txHash,
    });

    console.log(`   Transaction Log: https://explorer.solana.com/tx/${txHash}?cluster=devnet`);
    
    const newInfo = await connection.getAccountInfo(mint);
    assert(newInfo, "  Mint should be initialized.");

    const postBalance = (
      await connection.getTokenAccountBalance(destination)
    ).value.uiAmount;

    assert.equal(
      initialBalance + mintAmount,
      postBalance,
      "Post balance should equal initial plus mint amount"
    );

  });

  it("Lists the NFT to the marketplace", async() => {

    // 2 instructions are bundled into this transaction
    // 1. Create listing
    // 2. Deposits NFT to the vault
    const txHash = await program.methods
    .list(new BN(listing_price))
    .accountsPartial({
      maker: wallet.publicKey,
      marketplace: marketplace,
      makerMint: mint,
      tokenProgram: TOKEN_PROGRAM_ID
    })
    .rpc()

    const latestBlockHash = await connection.getLatestBlockhash()
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: txHash,
    });

    console.log("\n   The NFT has been listed successfully!");
    console.log(`   Transaction Log: https://explorer.solana.com/tx/${txHash}?cluster=devnet`);
  });

  it("Customer purchases the NFT from the marketplace", async() => {

    // There's 4 instruction bundled in this transaction
    // 1. Transferring of SOL (listing price) from customer to the maker/lister
    // 2. Transferring of SOL (marketplace fee) from customer to the marketplace's treasury
    // 3. Transferring of NFT from vault to the customer
    // 4. Close the vault accounts and other accounts not needed anymore
    const txHash = await program.methods
    .purchase()
    .accountsPartial({
      maker: wallet.publicKey,
      makerMint: mint,
      taker: customer.publicKey,
      marketplace: marketplace,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([customer])
    .rpc()

    const latestBlockHash = await connection.getLatestBlockhash()
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: txHash,
    });

    console.log(`\n   Transaction log: https://explorer.solana.com/tx/${txHash}?cluster=devnet`)
    console.log("   Customer has successfully purchased the NFT!")
  })

  it("Create another URI with NFT Lister's description", async () => {
    console.log("\nCreating another NFT to list......");

    //Create a umi devnet connection
    const umi = createUmi('https://api.devnet.solana.com');

    let keypair = umi.eddsa.createKeypairFromSecretKey(wallet.payer.secretKey);
    const signer = createSignerFromKeypair(umi, keypair);

    umi.use(irysUploader());
    umi.use(signerIdentity(signer));

    try{
      // Image of the NFT
      const image = "https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Leslie_Lamport.jpg/220px-Leslie_Lamport.jpg";
      
      // Description of the Service NFT
      const description = "I would edit out your videos for you to use as a content";

      const metadata = {
          name: "Service NFT",
          symbol: "SNFT",
          description: description,
          image: image,
          attributes: [
              {
                  trait_type: 'Category', value: 'Service',
                  
              }
          ],
          properties: {
              files: [
                  {
                      type: "image/jpg",
                      uri: image
                  },
              ]
          },
          creators: []
        };

        const myUri = await umi.uploader.uploadJson(metadata);

        // Update the lister URI with the newly created URI
        lister_uri = myUri;

        // Extract the first 20 characters after the base URI
        uri_seed = lister_uri.replace("https://arweave.net/", "").slice(0, 25);

        console.log("\n   URI Seed: ", uri_seed);

        // Derive mint and metadata addresses with the new URI seed
        [mint] = PublicKey.findProgramAddressSync(
          [
            Buffer.from(MINT_SEED),
            Buffer.from(uri_seed),
          ],
          program.programId
        );

        [metadataAddress] = PublicKey.findProgramAddressSync(
          [
            Buffer.from(METADATA_SEED),
            TOKEN_METADATA_PROGRAM_ID.toBuffer(),
            mint.toBuffer(),
          ],
          TOKEN_METADATA_PROGRAM_ID
        );
  
        [editionAddress] = PublicKey.findProgramAddressSync(
          [
            Buffer.from(METADATA_SEED),
            TOKEN_METADATA_PROGRAM_ID.toBuffer(),
            mint.toBuffer(),
            Buffer.from(EDITION_SEED),
          ],
          TOKEN_METADATA_PROGRAM_ID
        );

        console.log("   Your NFT URI: ", myUri);
    }
    catch(error) {
        console.log("Oops.. Something went wrong", error);
    }
  });

  it("Mint another NFT with customized metadata", async () => {

    metadata = {
      name: "Just a Test Token",
      symbol: "TEST",
      uri: lister_uri,
      decimals: 0,
    };

    const info = await connection.getAccountInfo(mint);

    if (info) {
      console.log("\n   Mint found! No need to initialize.");
      console.log("   Mint Address: ", mint)
      return; // Do not attempt to initialize if already initialized
    }

    console.log("\n   Mint not found. Attempting to initialize.");

    destination = await getAssociatedTokenAddressSync(
      mint,
      wallet.publicKey,
    );

    let initialBalance: number;

    try {
      const balance = (await connection.getTokenAccountBalance(destination))
      initialBalance = balance.value.uiAmount;
    } catch {
      // Token account not yet initiated has 0 balance
      initialBalance = 0;
    } 

    const txHash = await program.methods
      .mintNft(metadata, uri_seed, new BN(mintAmount * 10 ** metadata.decimals))
      .accounts({
        metadata: metadataAddress,
        payer: wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const latestBlockHash = await connection.getLatestBlockhash()
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: txHash,
    });

    console.log(`   Transaction Log: https://explorer.solana.com/tx/${txHash}?cluster=devnet`);
    
    const newInfo = await connection.getAccountInfo(mint);
    assert(newInfo, "  Mint should be initialized.");

    const postBalance = (
      await connection.getTokenAccountBalance(destination)
    ).value.uiAmount;

    assert.equal(
      initialBalance + mintAmount,
      postBalance,
      "Post balance should equal initial plus mint amount"
    );

  });

  it("Lists another NFT to the marketplace", async() => {

    // 2 instructions are bundled into this transaction
    // 1. Create listing
    // 2. Deposits NFT to the vault
    const txHash = await program.methods
    .list(new BN(listing_price))
    .accountsPartial({
      maker: wallet.publicKey,
      marketplace: marketplace,
      makerMint: mint,
      tokenProgram: TOKEN_PROGRAM_ID
    })
    .rpc()

    const latestBlockHash = await connection.getLatestBlockhash()
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: txHash,
    });

    console.log("\n   Another NFT has been listed successfully!");
    console.log(`   Transaction Log: https://explorer.solana.com/tx/${txHash}?cluster=devnet`);
  });

  it("Unlists the NFT", async() => {

    // Withdraws NFT from the vault back to the maker
    const txHash = await program.methods
    .unlist()
    .accountsPartial({
      maker: wallet.publicKey,
      marketplace: marketplace,
      makerMint: mint,
      tokenProgram: TOKEN_PROGRAM_ID
    })
    .rpc()

    const latestBlockHash = await connection.getLatestBlockhash()
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: txHash,
    });

    console.log("\n   Successflly unlists the NFT on the marketplace!");
    console.log(`   Transaction Log: https://explorer.solana.com/tx/${txHash}?cluster=devnet`);
  });
  
});

