use anchor_lang::prelude::*;

declare_id!("89FLpPbfBRCNojLgVaydAyHnf9Vbh4gP9Jabba67b956");

mod state;
mod error;

mod contexts;
use contexts::*;
use error::*;
use state::*;

#[program]
pub mod nftaas_marketplace {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, name: String, fee: u16) -> Result<()> {
        ctx.accounts.init(name, fee, &ctx.bumps)?;

        Ok(())
    }

    pub fn mint_nft(ctx: Context<MintNFT>, metadata: InitTokenParams, uri_seed: String, quantity: u64) -> Result<()> {
        let uri_seed_clone = uri_seed.clone();
        
        ctx.accounts.init_token(metadata, &uri_seed_clone, &ctx.bumps)?;
        ctx.accounts.mint_tokens(uri_seed_clone, quantity, &ctx.bumps)?;

        Ok(())
    }

    
    pub fn list(ctx: Context<List>, price: u64) -> Result<()> {
        ctx.accounts.create_listing(price, &ctx.bumps)?;
        ctx.accounts.deposit_nft()?;
    
        Ok(())
    }

    pub fn purchase(ctx: Context<Purchase>) -> Result<()> {
        ctx.accounts.send_fee_to_maker()?;
        ctx.accounts.send_fee_to_treasury()?;
        ctx.accounts.transfer_nft()?;
        ctx.accounts.close_vault()?;

        Ok(())
    }

    pub fn unlist(ctx: Context<Unlist>) -> Result<()> {
        ctx.accounts.withdraw_nft()?;

        // No need to do some functions for closing the listing account as it will do it automatically
        Ok(())
    }
}
