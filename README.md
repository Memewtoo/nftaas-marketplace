# NFTaaS Marketplace

A Marketplace where vendors can list their own services as an NFT.

In the process of doing so, they would be able to create and mint 
an NFT and imprint their services as a "description" of the NFT's metadata.

it can both support SPL-Token and Token2022 NFTs

## Program ID on Devnet
`89FLpPbfBRCNojLgVaydAyHnf9Vbh4gP9Jabba67b956`

## Overview
* Mints NFT with the vendors desired description
* List NFT
* Purchase NFT
* Unlist NFT

### Mints NFT with the vendors desired description
1. Creates a URI with the description of the vendor's services
2. Upload the URI to https://arweave.net/ through the help of `umi`
3. Initialize a metadata account for the NFT and use the recently uploaded URI
4. Mint the NFT and create a master edition account

### List NFT
1. Initialize a listing account with the values as inputted by the maker of the listing
2. Transfer the NFT to the listing's vault

### Purchase NFT
1. The customer will send listing price to the vendor along with the marketplace fee to the marketplace treasury
2. The NFT will be transferred from the listing's vault to the customer
3. Close the ununsed accounts

### Unlist NFT
1. Withdraw the NFT from the listing's vault back to the maker
2. Close all the unused accounts

### Requirements 
Before you begin, ensure you have met the following requirements:
Anchor v0.30.1

### Installation and Testing
1. Clone the repository and reference its directory:
```
git clone https://github.com/Memewtoo/nftaas-marketplace.git
cd nftaas-marketplace
```

2. Build the program:
```
anchor build
```

3. Install the dependencies:
```
npm install
```

4. Test the program:
```
anchor test
```
Or if you want to test the existing deployed program, make sure you are correctly referencing the the deployed `Program ID` on the top of this file, then run:
```
anchor test --skip-deploy
```

### Contributing
If you have any suggestions for improvements or new features, please don't hesistate to open an issue or submit a pull request.

---------------------------------------------------
Feel free to use this project as a learning resource to understand the basic mechanisms of nft marketplace on the Solana blockchain and build upon it to create more complex and feature-rich applications. Happy coding!



