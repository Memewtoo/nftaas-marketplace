use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken, 
    metadata::{
        create_master_edition_v3, create_metadata_accounts_v3, mpl_token_metadata::types::DataV2, CreateMasterEditionV3, CreateMetadataAccountsV3, Metadata as Metaplex
    }, 
    token_interface::{mint_to, MintTo, Mint, TokenAccount, TokenInterface},
};

use crate::state::init_tokenparams::*;

#[derive(Accounts)]
#[instruction(
    params: InitTokenParams,
    uri_seed: String
)]
pub struct MintNFT<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: New Metaplex Account being created
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,

    #[account(
        init,
        seeds = [
            b"mint",
            uri_seed.as_bytes()],
        bump,
        payer = payer,
        mint::decimals = params.decimals,
        mint::authority = payer.key(),
        mint::freeze_authority = payer.key(),
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: Validate address by deriving pda
    #[account(
        mut,
        seeds = [
            b"metadata", 
            token_metadata_program.key().as_ref(), 
            mint.key().as_ref(), 
            b"edition"],
        bump,
        seeds::program = token_metadata_program.key(),
    )]
    pub master_edition: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = payer,
    )]
    pub destination: InterfaceAccount<'info, TokenAccount>,

    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_metadata_program: Program<'info, Metaplex>,
}

impl <'info> MintNFT <'info> {
    pub fn init_token(&mut self, metadata: InitTokenParams, uri_seed: &String, bumps: &MintNFTBumps) -> Result<()> {
        
        // Construct NFT data
        let token_data: DataV2 = DataV2 {
            name: metadata.name,
            symbol: metadata.symbol,
            uri: metadata.uri,
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        };

        // Construct the Signer for CPI invocation
        let seeds = &[
            "mint".as_bytes(),
            uri_seed.as_bytes(),
            &[bumps.mint]];
        let signer = [&seeds[..]];

        // Create the context for creating a metadata account
        let metadata_ctx = CpiContext::new_with_signer(
            self.token_metadata_program.to_account_info(),
            CreateMetadataAccountsV3 {
                payer: self.payer.to_account_info(),
                update_authority: self.payer.to_account_info(),
                mint: self.mint.to_account_info(),
                metadata: self.metadata.to_account_info(),
                mint_authority: self.payer.to_account_info(),
                system_program: self.system_program.to_account_info(),
                rent: self.rent.to_account_info(),
            },
            &signer
        );

        // Invoke the create metadata account instruction
        create_metadata_accounts_v3(
            metadata_ctx,
            token_data,
            false, // Is mutable
            true, // Update authority is signer
            None, // Collection details
        )?;

        msg!("NFT Mint and Metadata initialized successfully!");

        Ok(())
    }

    pub fn mint_tokens(&mut self, uri_seed: String, quantity: u64, bumps: &MintNFTBumps) -> Result<()> {

        // Construct the signer for CPI invocation
        let seeds = &[
            "mint".as_bytes(),
            uri_seed.as_bytes(),
            &[bumps.mint]];
        let signer = [&seeds[..]];

        // Directly invoking the mint_to instruction with the context already inside
        mint_to(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                MintTo {
                    authority: self.payer.to_account_info(),
                    to: self.destination.to_account_info(),
                    mint: self.mint.to_account_info(),
                },
                &signer,
            ),
            quantity,
        )?;

        // Create a Master Edition Account of the NFT
        msg!("Creating master edition account");

        // Invoking the create_master_edition_v3 instruction on the token metadata program
        create_master_edition_v3(
            CpiContext::new(
                self.token_metadata_program.to_account_info(),
                CreateMasterEditionV3 {
                    edition: self.master_edition.to_account_info(),
                    mint: self.mint.to_account_info(),
                    update_authority: self.payer.to_account_info(),
                    mint_authority: self.payer.to_account_info(),
                    payer: self.payer.to_account_info(),
                    metadata: self.metadata.to_account_info(),
                    token_program: self.token_program.to_account_info(),
                    system_program: self.system_program.to_account_info(),
                    rent: self.rent.to_account_info(),
                },
            ),
            None, // Max Supply
        )?;

        msg!("NFT minted successfully.");

        Ok(())
    }
}