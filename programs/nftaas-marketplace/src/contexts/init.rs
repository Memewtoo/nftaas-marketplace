use anchor_lang::prelude::*;
use anchor_spl::token_interface::{TokenInterface};

use crate::{state::Marketplace, MarketplaceError};

#[derive(Accounts)]
#[instruction(name: String)]
pub struct Initialize<'info> {

    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        seeds = [b"marketplace", name.as_str().as_bytes()],
        bump,
        space = Marketplace::INIT_SPACE
    )]
    pub marketplace: Account<'info, Marketplace>,

    #[account(
        seeds = [b"treasury", marketplace.key().as_ref()],
        bump,
    )]
    pub treasury: SystemAccount<'info>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
}

impl<'info> Initialize<'info> {
    pub fn init(&mut self, name: String, fee: u16, bumps: &InitializeBumps) -> Result<()> {

        // Validate that the marketplace name length 
        // is a valid length to be used as a seed for PDA
        require!(name.len() > 0 && name.len() < 33, MarketplaceError::NameTooLong);
        
        self.marketplace.set_inner(Marketplace {
            admin: self.admin.key(),
            fee,
            bump: bumps.marketplace,
            treasury_bump: bumps.treasury,
            name,
        });

        Ok(())
    }
}