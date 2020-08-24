/**
 * Copyright (c) 2020 DigiByte Foundation NZ Limited
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

// Reconciler: index.js

const Logger = require('../logger');

const {
  ReconcilerError,
} = require('../errors');

const {
  SubtractValues,
  constructPartialBlockIdentifier,
  Hash,
} = require('../utils');

const sleep = require('../utils/sleep');

const defaults = {
  highWaterMark: -1,
  lookupBalanceByBlock: true,
  requiredDepthInactive: 500, 
  waitToCheckDiff: 10 * 1000,
  waitToCheckDiffSleep: 5000,
  withSeenAccounts: [],
};

const RECONCILIATION_INACTIVE_SLEEP_MS = 5000;

const RECONCILIATION_ACTIVE = 'ACTIVE';
const RECONCILIATION_INACTIVE = 'INACTIVE';

const RECONCILIATION_ERROR_HEAD_BEHIND_LIVE = 'ERROR_HEAD_BEHIND_LIVE';
const RECONCILIATION_ERROR_ACCOUNT_UPDATED = 'ACCOUNT_UPDATED';
const RECONCILIATION_ERROR_BLOCK_GONE = 'BLOCK_GONE';

class RosettaReconciler {
  constructor(args = {}) {
    const { networkIdentifier, helper, handler, fetcher } = args;
    const configuration = Object.assign({}, defaults, args);

    this.network = networkIdentifier;
    this.helper = helper;
    this.handler = handler;
    this.fetcher = fetcher;

    this.highWaterMark = configuration.lookupBalanceByBlock;
    this.lookupBalanceByBlock = configuration.lookupBalanceByBlock;

    this.interestingAccounts = configuration.interestingAccounts || [];
    this.inactiveQueue = [];
    this.seenAccounts = this.handleSeenAccounts(configuration.withSeenAccounts);

    this.requiredDepthInactive = configuration.requiredDepthInactive;
    this.waitToCheckDiff = configuration.waitToCheckDiff;
    this.waitToCheckDiffSleep = configuration.waitToCheckDiffSleep;

    this.changeQueue = [];
  }

  handleSeenAccounts(seenAccounts) {
    const seen = {};

    seenAccounts.forEach(s => {
      this.inactiveQueue.push({ entry: s });
      seen[Hash(s)] = {};
    });

    return seen;
  }

  queueChanges(blockIdentifier, balanceChangesArray) {
    for (let account of this.interestingAccounts) {
      let skipAccount = false;

      for (let change of balanceChangesArray) {
        if (Hash(account) == Hash(change)) {
          skipAccount = true;
          break;
        }
      }

      if (skipAccount) continue;

      balanceChangesArray.push({
        account_identifier: account.account,
        currency: account.currency,
        block_identifier: "0",
        difference: block,
      });
    }

    // ToDo: Remove one of these. JS is synchronous anyway.
    if (!this.lookupBalanceByBlock) {
      if (blockIdentifier.index < this.highWaterMark) {
        return null;
      }

      for (let change of balanceChangesArray) {
        this.changeQueue.push(change);
        Logger.info('Skipping active enqueue because backlog');
      }

    } else {
      for (let change of balanceChangesArray) {
        this.changeQueue.push(change);
      }
    }
  }

  async compareBalance(accountIdentifier, currency, amount, blockIdentifier) {
    const head = await this.helper.currentBlock();

    if (blockIdentifier.index > head.index) {
      throw new ReconcilerError(
        `Live block ${blockIdentifier.index} > head block ${head.index}`,
        RECONCILIATION_ERROR_HEAD_BEHIND_LIVE,
      );
    }

    const exists = await this.helper.blockExists(blockIdentifier);
    if (!exists) {
      throw new ReconcilerError(
        `Block gone! Block hash = ${blockIdentifier.hash}`,
        RECONCILIATION_ERROR_BLOCK_GONE,
      );
    }

    const { cachedBalance, balanceBlock } =
      await this.helper.accountBalance(accountIdentifier, currency, head);

    if (blockIdentifier.index < balanceBlock.index) {
      throw new ReconcilerError(
        `Account updated: ${JSON.stringify(accountIdentifier)} updated at blockheight ${balanceBlock.index}`,
        RECONCILIATION_ERROR_ACCOUNT_UPDATED,
      );
    }

    const difference = SubtractValues(cachedBalance.value, amount);
    return {
      difference,
      cachedBalance: cachedBalance.value,
      headIndex: head.index,
    };
  }

  async bestBalance(accountIdentifier, currency, partialBlockIdentifier) {
    if (this.lookupBalanceByBlock) {
      partialBlockIdentifier = null;
    }

    return await this.getCurrencyBalance(
      this.fetcher,
      this.network,
      accountIdentifier,
      currency,
      partialBlockIdentifier,
    );
  }

  async accountReconciliation(accountIdentifier, currency, amount, blockIdentifier, isInactive) {
    const accountCurrency = {
      account_identifier: accountIdentifier,
      currency: currency,
    };

    while (true) {
      let difference;
      let cachedBalance;
      let headIndex;

      try {
        const result = await this.compareBalance(
          accountIdentifier,
          currency,
          amount,
          blockIdentifier,
        );

        ({ difference, cachedBalance, headIndex } = result);
      } catch (e) {
        if (e instanceof ReconcilerError) {
          switch (e.type) {
            case RECONCILIATION_ERROR_HEAD_BEHIND_LIVE: {
              // This error will only occur when lookupBalanceByBlock
              // is disabled and the syncer is behind the current block of
              // the node. This error should never occur when
              // lookupBalanceByBlock is enabled.       
              const diff = blockIdentifier.index - headIndex;
              if (diff < this.waitToCheckDiff) {
                await sleep(this.waitToCheckDiffSleep);
                continue;
              } 

              // Don't wait to check if we are very far behind
              Logger.info(`Skipping reconciliation for ${JSON.stringify(accountCurrency)}:` +
                ` ${diff} blocks behind`);

              // Set a highWaterMark to not accept any new
              // reconciliation requests unless they happened
              // after this new highWaterMark.
              this.highWaterMark = partialBlockIdentifier.index;
              break;
            }

            case RECONCILIATION_ERROR_ACCOUNT_UPDATED: {
              // Either the block has not been processed in a re-org yet
              // or the block was orphaned
              break;
            }

            case RECONCILIATION_ERROR_BLOCK_GONE: {
              // If account was updated, it must be
              // enqueued again
              break;
            }

            default:
              break;
          }

        } else {
          throw e;
        }
      }

      let reconciliationType = RECONCILIATION_ACTIVE;

      if (isInactive) {
        reconciliationType = RECONCILIATION_INACTIVE;
      }

      if (difference != "0") {
        const error = await this.handler.reconciliationFailed(
          reconciliationType,
          accountCurrency.account_identifier,
          accountCurrency.currency,
          cachedBalance,
          amount,
          blockIdentifier,
        );

        if (error) throw error;
      }

      this.inactiveAccountQueue(isInactive, accountCurrency, blockIdentifier);

      return await this.handler.reconciliationSucceeded(
        reconciliationType,
        accountCurrency.account_identifier,
        accountCurrency.currency,
        amount,
        blockIdentifier,
      );
    }
  }

  static ContainsAccountCurrency(accountCurrencyMap, accountCurrency) {
    const element = accountCurrencyMap[Hash(accountCurrency)];
    return element != null;
  }

  async inactiveAccountQueue(isInactive, accountCurrency, blockIdentifier) {
    // Only enqueue the first time we see an account on an active reconciliation.
    let shouldEnqueueInactive = false;

    if (!isInactive && !RosettaReconciler.ContainsAccountCurrency(this.seenAccounts, accountCurrency)) {
      this.seenAccounts[Hash(accountCurrency)] = {};
      shouldEnqueueInactive = true;
    }

    if (isInactive || shouldEnqueueInactive) {
      this.inactiveQueue.push({
        entry: accountCurrency,
        lastCheck: blockIdentifier,
      });
    }
  }

  async reconcileActiveAccounts() {
    while (true) {
      const balanceChange = this.changeQueue.shift();
      if (balanceChange.block.index < this.highWaterMark) continue;

      const { block, value } = await this.bestBalance(
        balanceChange.account_identifier,
        balanceChange.currency,
        constructPartialBlockIdentifier(balanceChange.block),
      );

      await this.accountReconciliation(
        balanceChange.account_identifier,
        balanceChange.currency,
        value,
        block,
        false,
      );
    }
  }

  async reconcileInactiveAccounts() {
    while (true) {
      let head = null;

      try {
        head = this.helper.currentBlock();
      } catch(e) {

        Logger.info('Waiting to start inactive reconciliation until a block is synced...');
        await sleep(RECONCILIATION_INACTIVE_SLEEP_MS);
        continue;
      }

      if (this.inactiveQueue.length > 0 && (
        this.inactiveQueue[0].last_check == null || // block is set to nil when loaded from previous run
        this.inactiveQueue[0].last_check.index + this.requiredDepthInactive < head.index  
      )) {
        const randomAccount = this.inactiveQueue.shift();

        const { block, amount } = await this.bestBalance(
          randomAccount.entry.account_identifier,
          randomAccount.entry.currency,
          constructPartialBlockIdentifier(head),
        );

        await this.accountReconciliation(
          randomAccount.entry.account_identifier,
          randomAccount.entry.currency,
          amount,
          block,
          true,
        );

      } else {
        await sleep(RECONCILIATION_INACTIVE_SLEEP_MS);
      }
    }
  }

  async reconcile() {
    // ToDo: Multithreading support (worker?)
    await Promise.all([
      this.reconcileActiveAccounts(),
      this.reconcileInactiveAccounts(),
    ]);
  }

  static extractAmount(amountArray, currency) {
    for (let b of amountArray) {
      if (Hash(b.currency) != Hash(currency)) continue;
      return b;
    }

    throw new Error(`Could not extract amount for ${JSON.stringify(currency)}`);
  }

  async getCurrencyBalance(fetcher, networkIdentifier, accountIdentifier, currency, partialBlockIdentifier) {
    const { liveBlock, liveBalances } = await fetcher.AcountBalanceRetry(
      networkIdentifier,
      accountIdentifier,
      partialBlockIdentifier
    );

    const liveAmount = this.extractAmount(liveBalances, currency);

    return {
      block: liveBlock,
      value: liveAmount.value,
    };
  }
}

RosettaReconciler.AccountCurrency = class AccountCurrency {
  constructor(opts) {
    if (typeof opts == 'object' && opts.accountIdentifier) {
      const { accountIdentifier, currency } = opts;
      this.account = accountIdentifier;
      this.currency = currency;   
         
    } else {
      const [ accountIdentifier, currency ] = arguments;
      this.account = arguments[0];
      this.currency = arguments[1];   
    }
  };
}

RosettaReconciler.defaults = defaults;

module.exports = RosettaReconciler;