use anchor_lang::{prelude::*, system_program::{transfer, Transfer}};
use anchor_spl::{
    associated_token::AssociatedToken, 
    token_interface::{
        transfer_checked, 
        close_account, 
        CloseAccount, 
        Mint, 
        TokenAccount, 
        TokenInterface, 
        TransferChecked}
    };

use crate::state::{Listing, Marketplace};

#[derive(Accounts)]
pub struct Purchase<'info> {
    #[account(mut)]
    pub taker: Signer<'info>,

    #[account(mut)]
    pub maker: SystemAccount<'info>,

    pub maker_mint: InterfaceAccount<'info, Mint>,

    #[account(
        seeds = [b"marketplace", marketplace.name.as_str().as_bytes()],
        bump = marketplace.bump,
    )]
    pub marketplace: Account<'info, Marketplace>,

    #[account(
        init_if_needed,
        payer = taker,
        associated_token::mint = maker_mint,
        associated_token::authority = taker,
    )]
    pub taker_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = maker_mint,
        associated_token::authority = listing,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        close = maker,
        seeds = [marketplace.key().as_ref(), maker_mint.key().as_ref()],
        bump = listing.bump,
    )]
    pub listing: Account<'info, Listing>,

    #[account(
        mut,
        seeds = [b"treasury", marketplace.key().as_ref()],
        bump,
    )]
    pub treasury: SystemAccount<'info>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

impl<'info> Purchase <'info> {
    pub fn send_fee_to_maker(&mut self) -> Result <()> {
        let cpi_program = self.system_program.to_account_info();

        // Preparing the context to be used for Transfer CPI invocation
        let cpi_accounts = Transfer {
            from: self.taker.to_account_info(),
            to: self.maker.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        // Calculate the proper amount to transfer minus the marketplace fee
        let price = self.listing.price.clone();
        let fee = self.marketplace.fee.clone();

        let calculated_amount = price.checked_sub(
            price.checked_mul(fee as u64).unwrap().checked_div(10_000).unwrap()
        ).unwrap();

        // Transfer SOL equal to the listing price (minus the marketplace fee)
        // from the customer to othe maker
        transfer(cpi_ctx, calculated_amount)?;
        Ok (())
    }

    pub fn send_fee_to_treasury(&mut self) -> Result <()> {

        let cpi_program = self.system_program.to_account_info();

        // Prepare the context to be used for Transfer CPI invocation
        let cpi_accounts = Transfer{
            from: self.taker.to_account_info(),
            to: self.treasury.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        // Get the value of the listing price and the marketplace fee
        let price = self.listing.price.clone();
        let fee = self.marketplace.fee.clone();

        // Calculating the proper fee to be sent to the treasury
        let calculated_fee = price.checked_mul(fee.into()).unwrap().checked_div(10_000).unwrap();

        // Transfer SOL equal to the marketplace fee (minus the marketplace fee)
        // from the customer to othe marketplace treasury
        transfer(cpi_ctx, calculated_fee)?;
        
        Ok(())
    }

    pub fn transfer_nft(&mut self) -> Result <()> {
        let cpi_program = self.token_program.to_account_info();

        // Prepare the context to be used for TransferChecked CPI Invocation
        let cpi_accounts = TransferChecked {
            from: self.vault.to_account_info(),
            mint: self.maker_mint.to_account_info(),
            to: self.taker_ata.to_account_info(),
            authority: self.listing.to_account_info()
        };

        // Construct the signer seeds of the listing account
        let seeds = &[
            self.marketplace.to_account_info().key.as_ref(),
            self.maker_mint.to_account_info().key.as_ref(),
            &[self.listing.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

        // Transfer the NFT from the vault to the customer
        transfer_checked(cpi_ctx, 1, self.maker_mint.decimals)?;

        Ok(())
    }

    pub fn close_vault(&mut self) -> Result<()> {
        // We cannot close the vault token account automatically
        // by using "close" constraint, so we need to close it manually
        // by using the CloseAccount CPI of Token Program

        let cpi_program = self.token_program.to_account_info();

        // Prepare the context to be used for CloseAccount CPI invocation
        let cpi_accounts = CloseAccount{
            account: self.vault.to_account_info(),
            destination: self.maker.to_account_info(),
            authority: self.listing.to_account_info()
        };

        // Construct the signer seeds of the listing account
        let seeds = &[
            self.marketplace.to_account_info().key.as_ref(),
            self.maker_mint.to_account_info().key.as_ref(),
            &[self.listing.bump],
        ];

        let signer_seeds = &[&seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

        // Closes that vault token account and send back the rent to the maker
        close_account(cpi_ctx)?;

        Ok(())
    }
}