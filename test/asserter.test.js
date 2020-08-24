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

// asserter.test.js

// server.test.js
const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const RosettaSDK = require('..');

const {
  constructPartialBlockIdentifier,
} = require('../lib/utils');

const c = (j) => j == undefined ? undefined : JSON.parse(JSON.stringify(j));

const T = RosettaSDK.Client;

const createTempDir = () => {
  return new Promise((fulfill, reject) => {
    fs.mkdtemp('rosetta-test', (err, dir) => {
      if (err) return reject();
      return fulfill(dir);
    });    
  });
};

describe('Asserter Tests', function () {
  describe('Main', function () {
    const validNetwork = T.NetworkIdentifier.constructFromObject({
      blockchain: 'hello',
      network: 'world',
    });

    const validNetworkStatus = T.NetworkStatusResponse.constructFromObject({
      current_block_identifier: T.BlockIdentifier.constructFromObject({
        index: 0,
        hash: 'block 0',
      }),      
      genesis_block_identifier: T.BlockIdentifier.constructFromObject({
        index: 100,
        hash: 'block 100',        
      }),
      current_block_timestamp: RosettaSDK.Asserter.MinUnixEpoch + 1,
      peers: [
        { peer_id: 'peer 1' },
      ],
    });

    const invalidNetworkStatus = T.NetworkStatusResponse.constructFromObject({
      current_block_identifier: T.BlockIdentifier.constructFromObject({
        index: 100,
        hash: 'block 100',
      }),      
      current_block_timestamp: RosettaSDK.Asserter.MinUnixEpoch + 1,
      peers: [
        { peer_id: 'peer 1' },
      ],
    });

    const validNetworkOptions = T.NetworkOptionsResponse.constructFromObject({
      version: new T.Version('1.4.0', '1.0'),
      allow: T.Allow.constructFromObject({
        operation_statuses: [
          new T.OperationStatus('Success', true),
        ],
        operation_types: ['Transfer'],
        errors: [
          new T.Error(1, 'error', true),
        ],
        // historical_balance_lookup: true,
      }),
    });

    const invalidNetworkOptions = T.NetworkOptionsResponse.constructFromObject({
      version: new T.Version('1.4.0', '1.0'),
      allow: T.Allow.constructFromObject({
        operation_statuses: [],
        operation_types: ['Transfer'],
        errors: [
          new T.Error(1, 'error', true),
        ],
      }),
    });    

    const duplicateStatuses = T.NetworkOptionsResponse.constructFromObject({
      version: new T.Version('1.4.0', '1.0'),
      allow: T.Allow.constructFromObject({
        operation_statuses: [
          new T.OperationStatus('Success', true),
          new T.OperationStatus('Success', true),
        ],
        operation_types: ['Transfer'],
        errors: [
          new T.Error(1, 'error', true),
        ],
      }),
    });     

    const duplicateTypes = T.NetworkOptionsResponse.constructFromObject({
      version: new T.Version('1.4.0', '1.0'),
      allow: T.Allow.constructFromObject({
        operation_types: ['Transfer', 'Transfer'],
        operation_statuses: [new T.OperationStatus('Success', true)],
        errors: [
          new T.Error(1, 'error', true),
        ],
      }),
    });  

    const tests = {
      "valid responses": {
        network:        validNetwork,
        networkStatus:  validNetworkStatus,
        networkOptions: validNetworkOptions,

        err: null,
      },
      "invalid network status": {
        network:        validNetwork,
        networkStatus:  invalidNetworkStatus,
        networkOptions: validNetworkOptions,

        err: "BlockIdentifier is null",
      },
      "invalid network options": {
        network:        validNetwork,
        networkStatus:  validNetworkStatus,
        networkOptions: invalidNetworkOptions,

        err: "No Allow.operation_statuses found",
      },
      "duplicate operation statuses": {
        network:        validNetwork,
        networkStatus:  validNetworkStatus,
        networkOptions: duplicateStatuses,

        err: "Allow.operation_statuses contains a duplicate element: Success",
      },
      "duplicate operation types": {
        network:        validNetwork,
        networkStatus:  validNetworkStatus,
        networkOptions: duplicateTypes,

        err: "Allow.operation_statuses contains a duplicate element: Transfer",
      },
    };

    for (const test of Object.keys(tests)) {
      const testName = test;
      const testParams = tests[test];

      it(`should pass case '${testName}' with responses`, function () {
        let client;
        let configuration;

        try {
          client = RosettaSDK.Asserter.NewClientWithResponses(
            testParams.network,
            testParams.networkStatus,
            testParams.networkOptions,
          );
        } catch (e) {
          // console.error(e)
          expect(e.message).to.equal(testParams.err);
          return;
        }

        expect(client).to.not.equal(null);

        let thrown = false;

        try {
          configuration = client.getClientConfiguration();
        } catch (e) {
          console.error(e);
          thrown = true;
        }

        expect(thrown).to.equal(false);
        expect(configuration.network_identifier).to.equal(testParams.network)
        expect(configuration.genesis_block_identifier).to.equal(testParams.networkStatus.genesis_block_identifier);
        expect(configuration.allowed_operation_types).to.deep.equal(testParams.networkOptions.allow.operation_types);
        expect(configuration.allowed_operation_statuses).to.deep.equal(testParams.networkOptions.allow.operation_statuses);
      });

      it(`should pass case '${testName}' with file`, async function () {
        let dirpath;
        let filepath;
        let configuration;
        let client;
        let thrown = false;

        dirpath = await createTempDir();

        setTimeout(() => {
          // cleanup
          if (fs.existsSync(filepath))
            fs.unlinkSync(filepath);

          fs.rmdirSync(dirpath);
        }, 100);

        configuration = {
          network_identifier: testParams.network,
          genesis_block_identifier: testParams.networkStatus.genesis_block_identifier,
          allowed_operation_types: testParams.networkOptions.allow.operation_types,
          allowed_operation_statuses: testParams.networkOptions.allow.operation_statuses,
          allowed_errors: testParams.networkOptions.allow.errors,
        };

        filepath = path.join(dirpath, 'test.json');
        fs.writeFileSync(filepath, JSON.stringify(configuration));

        try {
          client = RosettaSDK.Asserter.NewClientWithFile(filepath);
        } catch(f) {
          // console.error(f)
          expect(f.message).to.equal(testParams.err);
          return;
        }

        try {
          configuration = client.getClientConfiguration();
        } catch (f) {
          // console.error(f);
          thrown = true;
        }    

        expect(thrown).to.equal(false);

        expect((configuration.network_identifier))
          .to.deep.equal(c(testParams.network))

        expect((configuration.genesis_block_identifier))
          .to.deep.equal((testParams.networkStatus.genesis_block_identifier));

        expect((configuration.allowed_operation_types))
          .to.deep.equal((testParams.networkOptions.allow.operation_types));

        expect((configuration.allowed_operation_statuses))
          .to.deep.equal((testParams.networkOptions.allow.operation_statuses));
      });        
    } 
  });

  describe('Block Tests', function () {
    const asserter = new RosettaSDK.Asserter();

    it('should successfully validate a block', async function () {
      let thrown = false;

      try {
        const block = new RosettaSDK.Client.BlockIdentifier(1, 'block 1');
        asserter.BlockIdentifier(block);
      } catch (e) {
        console.error(e);
        thrown = true; 
      }

      expect(thrown).to.equal(false);
    });

    it('should fail when blockidentifier is null', async function () {
      let thrown = false;

      try {
        const block = null;
        asserter.BlockIdentifier(block);
      } catch (e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('BlockIdentifier is null');
        thrown = true; 
      }

      expect(thrown).to.equal(true);
    });

    it('should fail due to a negative index', async function () {
      let thrown = false;

      try {
        const block = new RosettaSDK.Client.BlockIdentifier(-1, 'block 1');
        asserter.BlockIdentifier(block);
      } catch (e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('BlockIdentifier.index is negative');
        thrown = true; 
      }

      expect(thrown).to.equal(true);
    });

    it('should detect an invalid block hash', async function () {
      let thrown = false;

      try {
        const block = new RosettaSDK.Client.BlockIdentifier(1, '');
        asserter.BlockIdentifier(block);
      } catch (e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('BlockIdentifier.hash is missing');
        thrown = true; 
      }

      expect(thrown).to.equal(true);
    });
  });

  describe('Test Amount', function () {
    const asserter = new RosettaSDK.Asserter();
    const { Amount, Currency } = RosettaSDK.Client;

    it('should correctly handle a valid amount', async function () {
      let thrown = false;

      try {
        const amount = new Amount('100000', new Currency('BTC', 1));
        asserter.Amount(amount);
      } catch (e) {
        console.error(e);
        thrown = true; 
      }

      expect(thrown).to.equal(false);
    });

    it('should correctly handle a valid amount with no decimals', async function () {
      let thrown = false;

      try {
        const amount = new Amount('100000', new Currency('BTC'));
        asserter.Amount(amount);
      } catch (e) {
        console.error(e);
        thrown = true; 
      }

      expect(thrown).to.equal(false);
    });

    it('should correctly handle a negative amount', async function () {
      let thrown = false;

      try {
        const amount = new Amount('-100000', new Currency('BTC', 1));
        asserter.Amount(amount);
      } catch (e) {
        console.error(e);
        thrown = true; 
      }

      expect(thrown).to.equal(false);
    });

    it('should throw when having detecting no amount', async function () {
      let thrown = false;

      try {
        const amount = null;
        asserter.Amount(amount);
      } catch (e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('Amount.value is missing');
        thrown = true; 
      }

      expect(thrown).to.equal(true);
    });    

    it('should throw when currency is missing', async function () {
      let thrown = false;

      try {
        const amount = new Amount('100000', null);
        asserter.Amount(amount);
      } catch (e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('Amount.currency is null');
        thrown = true; 
      }

      expect(thrown).to.equal(true);
    });       

    it('should throw if amount.value is not a number', async function () {
      let thrown = false;

      try {
        const amount = new Amount('xxxx', new Currency('BTC', 1));
        asserter.Amount(amount);
      } catch (e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('Amount.value is not an integer: xxxx');
        thrown = true; 
      }

      expect(thrown).to.equal(true);
    });  

    it('should throw when detecting a non-int', async function () {
      let thrown = false;

      try {
        const amount = new Amount('1.1', new Currency('BTC', 1));
        asserter.Amount(amount);
      } catch (e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('Amount.value is not an integer: 1.1');
        thrown = true; 
      }

      expect(thrown).to.equal(true);
    });   

    it('should throw when passing an invalid symbol', async function () {
      let thrown = false;

      try {
        const amount = new Amount('11', new Currency(null, 1));
        asserter.Amount(amount);
      } catch (e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('Amount.currency does not have a symbol');
        thrown = true; 
      }

      expect(thrown).to.equal(true);      
    });     

    it('should throw when detecting invalid decimals', async function () {
      let thrown = false;

      try {
        const amount = new Amount('111', new Currency('BTC', -1));
        asserter.Amount(amount);
      } catch (e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('Amount.currency.decimals must be positive. Found: -1');
        thrown = true; 
      }

      expect(thrown).to.equal(true); 
    });     
  });

  describe('Test OperationIdentifier', function () {
    const asserter = new RosettaSDK.Asserter();
    const { OperationIdentifier } = RosettaSDK.Client;

    const validNetworkIndex = 1;
    const invalidNetworkIndex = -1;

    it('should assert a valid identifier', async function () {
      let thrown = false;

      try {
        const opId = new OperationIdentifier(0);
        const index = 0;
        asserter.OperationIdentifier(opId, index);
      } catch (e) {
        console.error(e);
        thrown = true; 
      }

      expect(thrown).to.equal(false);       
    });

    it('should throw when passing null as identifier', async function () {
      let thrown = false;

      try {
        const opId = null;
        const index = 0;
        asserter.OperationIdentifier(opId, index);
      } catch (e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('OperationIdentifier is null');
        thrown = true; 
      }

      expect(thrown).to.equal(true);       
    });    

    it('should throw when passing out of order index', async function () {
      let thrown = false;

      try {
        const opId = new OperationIdentifier(0);
        const index = 1;
        asserter.OperationIdentifier(opId, index);
      } catch (e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('OperationIdentifier.index 0 is out of order, expected 1');
        thrown = true; 
      }

      expect(thrown).to.equal(true);       
    });      

    it('should assert a valid identifier with a networkIndex properly', async function () {
      let thrown = false;

      try {
        const opId = new OperationIdentifier(0);
        opId.network_index = validNetworkIndex;

        const index = 0;
        asserter.OperationIdentifier(opId, index);
      } catch (e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('OperationIdentifier.index 0 is out of order, expected 1');
        thrown = true; 
      }

      expect(thrown).to.equal(false);       
    });   

    it('should throw when passing a valid identifier with an invalid networkIndex', async function () {
      let thrown = false;

      try {
        const opId = new OperationIdentifier(0);
        opId.network_index = invalidNetworkIndex;

        const index = 0;
        asserter.OperationIdentifier(opId, index);
      } catch (e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('OperationIdentifier.network_index is invalid');
        thrown = true; 
      }

      expect(thrown).to.equal(true);       
    });  
  });

  describe('Test AccountIdentifier', function () {
    const asserter = new RosettaSDK.Asserter();
    const { AccountIdentifier, SubAccountIdentifier } = RosettaSDK.Client;   
    
    it('should assert a valid identifier properly', async function () {
      let thrown = false;

      try {
        const accId = new AccountIdentifier('acct1');
        asserter.AccountIdentifier(accId);
      } catch (e) {
        console.error(e);
        thrown = true; 
      }

      expect(thrown).to.equal(false);        
    }); 

    it('should throw when passing an invalid address', async function () {
      let thrown = false;

      try {
        const accId = new AccountIdentifier('');
        asserter.AccountIdentifier(accId);
      } catch (e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('Account.address is missing');
        thrown = true; 
      }

      expect(thrown).to.equal(true);        
    }); 

    it('should assert a valid identifier with subaccount', async function () {
      let thrown = false;

      try {
        const accId = new AccountIdentifier('acct1');
        accId.sub_account = new SubAccountIdentifier('acct2');
        asserter.AccountIdentifier(accId);
      } catch (e) {
        console.error(e);
        thrown = true; 
      }

      expect(thrown).to.equal(false);        
    }); 

    it('throw when passing an invalid identifier with subaccount', async function () {
      let thrown = false;

      try {
        const accId = new AccountIdentifier('acct1');
        accId.sub_account = new SubAccountIdentifier('');
        asserter.AccountIdentifier(accId);
      } catch (e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('Account.sub_account.address is missing');
        thrown = true; 
      }

      expect(thrown).to.equal(true);        
    }); 
  });

  describe('Test Operation', function () {
    const asserter = new RosettaSDK.Asserter();
    const {
      Amount,
      Currency,
      OperationIdentifier,
      Operation,
      AccountIdentifier,
      NetworkIdentifier,
      BlockIdentifier,
      Peer, 
      NetworkOptionsResponse,
      NetworkStatusResponse,
      Version,
      Allow,
      OperationStatus,
    } = RosettaSDK.Client;      

    const validAmount = new Amount('1000', new Currency('BTC', 8));
    const validAccount = new AccountIdentifier('test');

    const tests = {
      'valid operation': {
        operation: Operation.constructFromObject({
          operation_identifier: new OperationIdentifier(1),
          type:    'PAYMENT',
          status:  'SUCCESS',
          account: validAccount,
          amount:  validAmount,
        }),
        index:      1,
        successful: true,
        err:        null,
      },
      'valid operation no account': {
        operation: Operation.constructFromObject({
          operation_identifier: new OperationIdentifier(1),
          type:   'PAYMENT',
          status: 'SUCCESS',
        }),
        index:      1,
        successful: true,
        err:        null,
      },
      'nil operation': {
        operation: null,
        index:     1,
        err:       'Operation is null',
      },
      'invalid operation no account': {
        operation: Operation.constructFromObject({
          operation_identifier: new OperationIdentifier(1),
          type:   'PAYMENT',
          status: 'SUCCESS',
          amount: validAmount,
        }),
        index: 1,
        err:   'Account is null',
      },
      'invalid operation empty account': {
        operation: Operation.constructFromObject({
          operation_identifier: new OperationIdentifier(1),
          type:    'PAYMENT',
          status:  'SUCCESS',
          account: new AccountIdentifier(),
          amount:  validAmount,
        }),
        index: 1,
        err:   'Account.address is missing',
      },
      'invalid operation invalid index': {
        operation: Operation.constructFromObject({
          operation_identifier: new OperationIdentifier(1),
          type:   'PAYMENT',
          status: 'SUCCESS',
        }),
        index: 2,
        err:   'OperationIdentifier.index 1 is out of order, expected 2',
      },
      'invalid operation invalid type': {
        operation: Operation.constructFromObject({
          operation_identifier: new OperationIdentifier(1),
          type:   'STAKE',
          status: 'SUCCESS',
        }),
        index: 1,
        err:   'Operation.type STAKE is invalid',
      },
      'unsuccessful operation': {
        operation: Operation.constructFromObject({
          operation_identifier: new OperationIdentifier(1),
          type:   'PAYMENT',
          status: 'FAILURE',
        }),
        index:      1,
        successful: false,
        err:        null,
      },
      'invalid operation invalid status': {
        operation: Operation.constructFromObject({
          operation_identifier: new OperationIdentifier(1),
          type:   'PAYMENT',
          status: 'DEFERRED',
        }),
        index: 1,
        err:   'OperationStatus.status DEFERRED is not valid within this Asserter',
      },
      'valid construction operation': {
        operation: Operation.constructFromObject({
          operation_identifier: new OperationIdentifier(1),
          type:    'PAYMENT',
          account: validAccount,
          amount:  validAmount,
        }),
        index:        1,
        successful:   false,
        construction: true,
        err:          null,
      },
      'invalid construction operation': {
        operation: Operation.constructFromObject({
          operation_identifier: new OperationIdentifier(1),
          type:    'PAYMENT',
          status:  'SUCCESS',
          account: validAccount,
          amount:  validAmount,
        }),
        index:        1,
        successful:   false,
        construction: true,
        err:          'Operation.status must be empty for construction',
      },
    };

    for (let testName of Object.keys(tests)) {
      const testParams = tests[testName];

      const networkIdentifier = new NetworkIdentifier('hello', 'world');

      const networkStatusResponse = NetworkStatusResponse.constructFromObject({
        genesis_block_identifier: new BlockIdentifier(0, 'block 0'),
        current_block_identifier: new BlockIdentifier(100, 'block 100'),
        current_block_timestamp: RosettaSDK.Asserter.MinUnixEpoch + 1,
        peers: [ new Peer('peer 1') ],
      });

      const networkOptionsResponse = NetworkOptionsResponse.constructFromObject({
        version: new Version('1.4.0', '1.0'),
        allow: new Allow([
          new OperationStatus('SUCCESS', true),
          new OperationStatus('FAILURE', false),
        ], ['PAYMENT']),
      });

      let asserter;

      try {
        asserter = RosettaSDK.Asserter.NewClientWithResponses(
          networkIdentifier,
          networkStatusResponse,
          networkOptionsResponse,
        );
      } catch (e) {
        console.error(e);
      }

      it(`should pass test case '${testName}'`, async function () {
        expect(asserter).to.not.equal(undefined);

        let thrown = false;

        try {
          asserter.Operation(testParams.operation, testParams.index, testParams.construction);
        } catch (e) {
          // console.error(e);
          expect(e.message).to.equal(testParams.err);
          thrown = true;   
        }

        expect(thrown).to.equal(testParams.err != null);

        if (!thrown && !testParams.construction) {
          let success;

          try {
            success = asserter.OperationSuccessful(testParams.operation);
          } catch (e) {
            console.error(e);
            thrown = true;
          } finally {
            expect(thrown).to.equal(false);
            expect(success).to.equal(testParams.successful);
          }
        }
      });
    }
  });

  describe('ConstructionMetadataResponse Tests', function () {
    const asserter = new RosettaSDK.Asserter();

    const {
      ConstructionMetadataResponse,
    } = RosettaSDK.Client;

    it('should assert a valid response', async function () {
      let thrown = false;

      let metadata = {
      };

      let response = new ConstructionMetadataResponse(metadata);

      try {
        asserter.ConstructionMetadataResponse(response)
      } catch (e) {
        console.error(e);
        thrown = true;
      }

      expect(thrown).to.equal(false);      
    });

    it('should throw on a null response', async function () {
      let thrown = false;

      let metadata = {
      };

      let response = null;

      try {
        asserter.ConstructionMetadataResponse(response)
      } catch (e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('ConstructionMetadataResponse cannot be null');
        thrown = true;
      }

      expect(thrown).to.equal(true);      
    });   

    it('should throw on invalid metadata', async function () {
      let thrown = false;

      let metadata = null;
      let response = new ConstructionMetadataResponse(metadata);

      try {
        asserter.ConstructionMetadataResponse(response)
      } catch (e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('ConstructionMetadataResponse.metadata is null');
        thrown = true;
      }

      expect(thrown).to.equal(true);      
    });    
  });

  describe('ConstructionSubmitResponse Tests', function () {
    const asserter = new RosettaSDK.Asserter();

    const {
      ConstructionSubmitResponse,
      TransactionIdentifier,
    } = RosettaSDK.Client;

    it('should assert a valid response', async function () {
      let thrown = false;

      let txId = new TransactionIdentifier('tx1');
      let response = new ConstructionSubmitResponse(txId);

      try {
        asserter.ConstructionSubmitResponse(response);
      } catch (e) {
        console.error(e);
        thrown = true;
      }

      expect(thrown).to.equal(false);      
    });

    it('should throw on a null response', async function () {
      let thrown = false;

      let response = null;

      try {
        asserter.ConstructionSubmitResponse(response);
      } catch (e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('ConstructionSubmitResponse cannot be null');        
        thrown = true;
      }

      expect(thrown).to.equal(true);      
    });   

    it('should throw on invalid transaction identifier', async function () {
      let thrown = false;

      let txId = null;
      let response = new ConstructionSubmitResponse(txId);

      try {
        asserter.ConstructionSubmitResponse(response);
      } catch (e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('TransactionIdentifier is null');        
        thrown = true;
      }

      expect(thrown).to.equal(true);       
    });    
  });

  describe('Network Tests', function () {
    const asserter = new RosettaSDK.Asserter();

    const {
      NetworkIdentifier,
      SubNetworkIdentifier,
    } = RosettaSDK.Client;

    it('should assert a valid network properly', async function () {
      let thrown = false;

      const network = new NetworkIdentifier('bitcoin', 'mainnet');

      try {
        asserter.NetworkIdentifier(network);
      } catch (e) {
        thrown = true;
      }

      expect(thrown).to.equal(false);       
    });

    it('should throw when network is null', async function () {
      let thrown = false;

      const network = null;

      try {
        asserter.NetworkIdentifier(network);
      } catch (e) {
        // console.error(e)
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('NetworkIdentifier is null');
        thrown = true;
      }
      
      expect(thrown).to.equal(true);       
    });   

    it('should throw when asserting an invalid network (blockchain missing)', async function () {
      let thrown = false;

      const network = new NetworkIdentifier('', 'mainnet');

      try {
        asserter.NetworkIdentifier(network);
      } catch (e) {
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('NetworkIdentifier.blockchain is missing');        
        thrown = true;
      }

      expect(thrown).to.equal(true);       
    });

    it('should throw when asserting an invalid network (network missing)', async function () {
      let thrown = false;

      const network = new NetworkIdentifier('bitcoin', '');

      try {
        asserter.NetworkIdentifier(network);
      } catch (e) {
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('NetworkIdentifier.network is missing');        
        thrown = true;
      }

      expect(thrown).to.equal(true);       
    });    

    it('should correctly assert a valid subnetwork', async function () {
      let thrown = false;

      const network = new NetworkIdentifier('bitcoin', 'mainnet');
      network.sub_network_identifier = new SubNetworkIdentifier('shard 1');

      try {
        asserter.NetworkIdentifier(network);
      } catch (e) {
        thrown = true;
      }

      expect(thrown).to.equal(false);       
    });   

    it('should throw when passing an invalid subnetwork', async function () {
      let thrown = false;

      const network = new NetworkIdentifier('bitcoin', 'mainnet');
      network.sub_network_identifier = new SubNetworkIdentifier();

      try {
        asserter.NetworkIdentifier(network);
      } catch (e) {
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('NetworkIdentifier.sub_network_identifier.network is missing');        
        thrown = true;
      }

      expect(thrown).to.equal(true);       
    });    
  });

  describe('Test Version', function () {
    const asserter = new RosettaSDK.Asserter();

    const {
      Version,
    } = RosettaSDK.Client;

    const middlewareVersion = '1.2';
    const invalidMiddlewareVersion = '';
    const validRosettaVersion = '1.4.0';

    it('should assert a valid version correctly', async function () {
      let thrown = false;

      let version = Version.constructFromObject({
        rosetta_version: validRosettaVersion,
        node_version: '1.0',
      });

      try {
        asserter.Version(version);
      } catch(e) {
        console.error(e);
        thrown = true;
      }

      expect(thrown).to.equal(false);
    });

    it('should assert a valid version with middleware correctly', async function () {
      let thrown = false;

      let version = Version.constructFromObject({
        rosetta_version: validRosettaVersion,
        node_version: '1.0',
        middleware_version: middlewareVersion,
      });

      try {
        asserter.Version(version);
      } catch(e) {
        console.error(e);
        thrown = true;
      }

      expect(thrown).to.equal(false);
    });

    it('should throw on too old rosetta version', async function () {
      let thrown = false;

      let version = Version.constructFromObject({
        rosetta_version: '1.2.0',
        node_version: '1.0',
      });

      try {
        asserter.Version(version);
      } catch(e) {
        console.error(e);
        thrown = true;
      }

      expect(thrown).to.equal(false);
    });  

    it('should throw on null version', async function () {
      let thrown = false;

      let version = null;

      try {
        asserter.Version(version);
      } catch(e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('Version is null');             
        thrown = true;
      }

      expect(thrown).to.equal(true);
    }); 

    it('should throw on invalid node version', async function () {
      let thrown = false;

      let version = Version.constructFromObject({
        rosetta_version: '1.2.0',
      });

      try {
        asserter.Version(version);
      } catch(e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('Version.node_version is missing');             
        thrown = true;
      }

      expect(thrown).to.equal(true);
    });     

    it('should throw on invalid middleware version', async function () {
      let thrown = false;

      let version = Version.constructFromObject({
        rosetta_version: validRosettaVersion,
        node_version: '1.0',
        middleware_version: invalidMiddlewareVersion,
      });

      try {
        asserter.Version(version);
      } catch(e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('Version.middleware_version is missing');             
        thrown = true;
      }

      expect(thrown).to.equal(true);
    });      
  });

  describe('Test Allow', function () {
    const asserter = new RosettaSDK.Asserter();

    const {
      OperationStatus,
      Allow,
    } = RosettaSDK.Client;    

    const operationStatuses = [
      new OperationStatus('SUCCESS', true),
      new OperationStatus('FAILURE', false),
    ];  

    const operationTypes = ['PAYMENT'];

    it('should assert a valid allow correctly', async function () {
      let thrown = false;

      let allow = new Allow(operationStatuses, operationTypes);

      try {
        asserter.Allow(allow);

      } catch(e) {
        thrown = true;
      }

      expect(thrown).to.equal(false);
    });

    it('should throw when null is passed', async function () {
      let thrown = false;

      let allow = null;

      try {
        asserter.Allow(allow);

      } catch(e) {
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('Allow is null');          
        thrown = true;
      }

      expect(thrown).to.equal(true);
    });    

    it('should throw when no operationStatuses are found', async function () {
      let thrown = false;

      let allow = new Allow(null, operationTypes);

      try {
        asserter.Allow(allow);

      } catch(e) {
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('No Allow.operation_statuses found');          
        thrown = true;
      }

      expect(thrown).to.equal(true);
    });    

    it('should throw when no successful statuses are found', async function () {
      let thrown = false;

      let allow = new Allow([operationStatuses[1]], operationTypes);

      try {
        asserter.Allow(allow);

      } catch(e) {
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('No successful Allow.operation_statuses found');          
        thrown = true;
      }

      expect(thrown).to.equal(true);
    });    
    
    it('should throw when no operation types exist', async function () {
      let thrown = false;

      let allow = new Allow(operationStatuses, null);

      try {
        asserter.Allow(allow);

      } catch(e) {
        // console.error(e)
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('No Allow.operation_statuses found');          
        thrown = true;
      }

      expect(thrown).to.equal(true);
    });        
  });

  describe('Test Error', function () {
    const asserter = new RosettaSDK.Asserter();

    it('should assert a valid error correctly', async function () {
      let thrown = false;

      const error = new RosettaSDK.Client.Error(12, 'signature invalid');

      try {
        asserter.Error(error);
      } catch (e) {
        thrown = true;
      }

      expect(thrown).to.equal(false);
    });

    it('should throw when passing nil', async function () {
      let thrown = false;

      const error = null;

      try {
        asserter.Error(error);
      } catch (e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('Error is null');       
        thrown = true;
      }

      expect(thrown).to.equal(true);
    });

    it('should throw on negative error codes', async function () {
      let thrown = false;

      const error = new RosettaSDK.Client.Error(-1, 'signature invalid');

      try {
        asserter.Error(error);
      } catch (e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('Error.code is negative');       
        thrown = true;
      }

      expect(thrown).to.equal(true);
    });

    it('should throw on empty error message', async function () {
      let thrown = false;

      const error = new RosettaSDK.Client.Error(0);

      try {
        asserter.Error(error);
      } catch (e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('Error.message is missing');       
        thrown = true;
      }

      expect(thrown).to.equal(true);
    });
  });

  describe('Test Errors', function () {
    const asserter = new RosettaSDK.Asserter();

    it('should assert valid errors correctly', async function () {
      let thrown = false;

      const errors = [
        new RosettaSDK.Client.Error(0, 'error 1'),
        new RosettaSDK.Client.Error(1, 'error 2'),
      ];

      try {
        asserter.Errors(errors);
      } catch (e) {
        thrown = true;
      }

      expect(thrown).to.equal(false);
    });

    it('should throw on duplicate error codes', async function () {
      let thrown = false;

      const errors = [
        new RosettaSDK.Client.Error(0, 'error 1'),
        new RosettaSDK.Client.Error(0, 'error 2'),
      ];

      try {
        asserter.Errors(errors);
      } catch (e) {
        // console.error(e)
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('Error code used multiple times');           
        thrown = true;
      }

      expect(thrown).to.equal(true);
    });    
  });

  describe('Test Valid Network List Response', function () {
    const asserter = new RosettaSDK.Asserter();

    const {
      NetworkIdentifier,
      SubNetworkIdentifier,
      NetworkListResponse,
    } = RosettaSDK.Client;

    const network1 = new NetworkIdentifier('blockchain 1', 'network 1');

    const network1Sub = new NetworkIdentifier('blockchain 1', 'network 1');
    network1Sub.sub_network_identifier = new SubNetworkIdentifier('subnetwork');

    const network2 = new NetworkIdentifier('blockchain 2', 'network 2');

    const network3 = new NetworkIdentifier(null, 'network 2');

    it('should assert a valid network list correctly', async function () {
      let thrown = false;

      const networkListResponse = new NetworkListResponse([
        network1,
        network1Sub,
        network2,
      ]);

      try {
        asserter.NetworkListResponse(networkListResponse);
      } catch(e) {
        console.error(e);
        thrown = true;
      }

      expect(thrown).to.equal(false);
    });

    it('should throw when passing null', async function () {
      let thrown = false;

      const networkListResponse = null;

      try {
        asserter.NetworkListResponse(networkListResponse);
      } catch(e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('NetworkListResponse is null');        
        thrown = true;
      }

      expect(thrown).to.equal(true);
    });

    it('should throw when passing a duplicate network', async function () {
      let thrown = false;

      const networkListResponse = new NetworkListResponse([
        network1Sub,
        network1Sub,
      ]);
      
      try {
        asserter.NetworkListResponse(networkListResponse);
      } catch(e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('NetworkListResponse.Network contains duplicated');        
        thrown = true;
      }

      expect(thrown).to.equal(true);
    });

    it('should throw when passing an invalid network', async function () {
      let thrown = false;

      const networkListResponse = new NetworkListResponse([
        network3,
      ]);
      
      try {
        asserter.NetworkListResponse(networkListResponse);
      } catch(e) {
        // console.error(e);
        expect(e.name).to.equal('AsserterError');
        expect(e.message).to.equal('NetworkIdentifier.blockchain is missing');        
        thrown = true;
      }

      expect(thrown).to.equal(true);
    });            
  });

  describe('Test Block', function () {
    const asserter = new RosettaSDK.Asserter();
    const {
      Amount,
      Currency,
      OperationIdentifier,
      Operation,
      AccountIdentifier,
      NetworkIdentifier,
      BlockIdentifier,
      Block,
      Transaction,
      TransactionIdentifier,
      Peer, 
      NetworkOptionsResponse,
      NetworkStatusResponse,
      Version,
      Allow,
      OperationStatus,
    } = RosettaSDK.Client;      

    const validBlockIdentifier = new BlockIdentifier(100, 'blah');
    const validParentBlockIdentifier = new BlockIdentifier(99, 'blah parent');

    const validAmount = new Amount('1000', new Currency('BTC', 8));
    const validAccount = new AccountIdentifier('test');

    const validTransaction = new Transaction(
      new TransactionIdentifier('blah'),
      [
        Operation.constructFromObject({
          operation_identifier: new OperationIdentifier(0),
          type: 'PAYMENT',
          status: 'SUCCESS',
          account: validAccount,
          amount: validAmount,
        }),

        Operation.constructFromObject({
          operation_identifier: new OperationIdentifier(1),
          related_operations: [
            new OperationIdentifier(0),
          ],
          type: 'PAYMENT',
          status: 'SUCCESS',
          account: validAccount,
          amount: validAmount,
        }),
      ],
    );

    const relatedToSelfTransaction = new Transaction(
      new TransactionIdentifier('blah'),
      [
        Operation.constructFromObject({
          operation_identifier: new OperationIdentifier(0),
          related_operations: [
            new OperationIdentifier(0),
          ],      
          type: 'PAYMENT',
          status: 'SUCCESS',
          account: validAccount,
          amount: validAmount,
        }),
      ],
    );

    const outOfOrderTransaction = new Transaction(
      new TransactionIdentifier('blah'),
      [
        Operation.constructFromObject({
          operation_identifier: new OperationIdentifier(1),
          related_operations: [
            new OperationIdentifier(0),
          ],      
          type: 'PAYMENT',
          status: 'SUCCESS',
          account: validAccount,
          amount: validAmount,
        }),

        Operation.constructFromObject({
          operation_identifier: new OperationIdentifier(0),
          type: 'PAYMENT',
          status: 'SUCCESS',
          account: validAccount,
          amount: validAmount,
        }),
      ],
    );

    const relatedToLaterTransaction = new Transaction(
      new TransactionIdentifier('blah'),
      [
        Operation.constructFromObject({
          operation_identifier: new OperationIdentifier(0),
          related_operations: [
            new OperationIdentifier(1),
          ],      
          type: 'PAYMENT',
          status: 'SUCCESS',
          account: validAccount,
          amount: validAmount,
        }),

        Operation.constructFromObject({
          operation_identifier: new OperationIdentifier(1),
          related_operations: [
            new OperationIdentifier(0),
          ],      
          type: 'PAYMENT',
          status: 'SUCCESS',
          account: validAccount,
          amount: validAmount,
        }),
      ],
    );

    const relatedDuplicateTransaction = new Transaction(
      new TransactionIdentifier('blah'),
      [
        Operation.constructFromObject({
          operation_identifier: new OperationIdentifier(0),
          type: 'PAYMENT',
          status: 'SUCCESS',
          account: validAccount,
          amount: validAmount,
        }),

        Operation.constructFromObject({
          operation_identifier: new OperationIdentifier(1),
          related_operations: [
            new OperationIdentifier(0),
            new OperationIdentifier(0),
          ],      
          type: 'PAYMENT',
          status: 'SUCCESS',
          account: validAccount,
          amount: validAmount,
        }),
      ],
    );    

    const tests = {
      'valid block': {
        block: Block.constructFromObject({
          block_identifier: validBlockIdentifier,
          parent_block_identifier: validParentBlockIdentifier,
          timestamp: RosettaSDK.Asserter.MinUnixEpoch + 1,
          transactions: [validTransaction],
        }),
        err: null,
      },
      'genesis block': {
        block: Block.constructFromObject({
          block_identifier: validBlockIdentifier,
          parent_block_identifier: validBlockIdentifier,
          transactions: [validTransaction],
        }),
        genesisIndex: validBlockIdentifier.index,
        err: null,
      },
      'out of order transaction operations': {
        block: Block.constructFromObject({
          block_identifier: validBlockIdentifier,
          parent_block_identifier: validParentBlockIdentifier,
          timestamp: RosettaSDK.Asserter.MinUnixEpoch + 1,
          transactions: [outOfOrderTransaction],
        }),
        err: 'OperationIdentifier.index 1 is out of order, expected 0',
      },
      'related to self transaction operations': {
        block: Block.constructFromObject({
          block_identifier: validBlockIdentifier,
          parent_block_identifier: validParentBlockIdentifier,
          timestamp: RosettaSDK.Asserter.MinUnixEpoch + 1,
          transactions: [relatedToSelfTransaction],
        }),
        err: 'Related operation index 0 >= operation index 0',
      },
      'related to later transaction operations': {
        block: Block.constructFromObject({
          block_identifier: validBlockIdentifier,
          parent_block_identifier: validParentBlockIdentifier,
          timestamp: RosettaSDK.Asserter.MinUnixEpoch + 1,
          transactions: [relatedToLaterTransaction],
        }),
        err: 'Related operation index 1 >= operation index 0',
      },
      'duplicate related transaction operations': {
        block: Block.constructFromObject({
          block_identifier: validBlockIdentifier,
          parent_block_identifier: validParentBlockIdentifier,
          timestamp: RosettaSDK.Asserter.MinUnixEpoch + 1,
          transactions: [relatedDuplicateTransaction],
        }),
        err: 'Found duplicate related operation index 0 for operation index 1',
      },
      'nil block': {
        block: null,
        err: 'Block is null',
      },
      'nil block hash': {
        block: Block.constructFromObject({
          block_identifier: null,
          parent_block_identifier: validParentBlockIdentifier,
          timestamp: RosettaSDK.Asserter.MinUnixEpoch + 1,
          transactions: [validTransaction],
        }),
        err: 'BlockIdentifier is null',
      },
      'invalid block hash': {
        block: Block.constructFromObject({
          block_identifier: new BlockIdentifier(),
          parent_block_identifier: validParentBlockIdentifier,
          timestamp: RosettaSDK.Asserter.MinUnixEpoch + 1,
          transactions: [validTransaction],
        }),
        err: 'BlockIdentifier.hash is missing',
      },
      'block previous hash missing': {
        block: Block.constructFromObject({
          block_identifier: validBlockIdentifier,
          parent_block_identifier: new BlockIdentifier(),
          timestamp: RosettaSDK.Asserter.MinUnixEpoch + 1,
          transactions: [validTransaction],
        }),
        err: 'BlockIdentifier.hash is missing',
      },
      'invalid parent block index': {
        block: Block.constructFromObject({
          block_identifier: validBlockIdentifier,
          parent_block_identifier: new BlockIdentifier(
            validBlockIdentifier.index,
            validParentBlockIdentifier.hash,
          ),
          timestamp: RosettaSDK.Asserter.MinUnixEpoch + 1,
          transactions: [validTransaction],
        }),
        err: 'BlockIdentifier.index <= ParentBlockIdentifier.index',
      },
      'invalid parent block hash': {
        block: Block.constructFromObject({
          block_identifier: validBlockIdentifier,
          parent_block_identifier: new BlockIdentifier(
            validParentBlockIdentifier.index,
            validBlockIdentifier.hash,
          ),
          timestamp: RosettaSDK.Asserter.MinUnixEpoch + 1,
          transactions: [validTransaction],
        }),
        err: 'BlockIdentifier.hash == ParentBlockIdentifier.hash',
      },
      'invalid block timestamp less than RosettaSDK.Asserter.MinUnixEpoch': {
        block: Block.constructFromObject({
          block_identifier: validBlockIdentifier,
          parent_block_identifier: validParentBlockIdentifier,
          transactions: [validTransaction],
        }),
        err: 'Timestamp 0 is before 01/01/2000',
      },
      'invalid block timestamp greater than MaxUnixEpoch': {
        block: Block.constructFromObject({
          block_identifier: validBlockIdentifier,
          parent_block_identifier: validParentBlockIdentifier,
          transactions: [validTransaction],
          timestamp: RosettaSDK.Asserter.MaxUnixEpoch + 1,
        }),
        err: 'Timestamp 2209017600001 is after 01/01/2040',
      },
      'invalid block transaction': {
        block: Block.constructFromObject({
          block_identifier: validBlockIdentifier,
          parent_block_identifier: validParentBlockIdentifier,
          timestamp: RosettaSDK.Asserter.MinUnixEpoch + 1,
          transactions: [
            new Transaction(),
          ],
        }),
        err: 'TransactionIdentifier is null',
      },      
    };

    for (let testName of Object.keys(tests)) {
      const testParams = tests[testName];

      const networkIdentifier = new NetworkIdentifier('hello', 'world');

      const genesisIndex = testParams.genesisIndex != null ? testParams.genesisIndex : 0;

      const networkStatusResponse = NetworkStatusResponse.constructFromObject({
        genesis_block_identifier: new BlockIdentifier(genesisIndex, `block ${genesisIndex}`),
        current_block_identifier: new BlockIdentifier(100, 'block 100'),
        current_block_timestamp: RosettaSDK.Asserter.MinUnixEpoch + 1,
        peers: [ new Peer('peer 1') ],
      });

      const networkOptionsResponse = NetworkOptionsResponse.constructFromObject({
        version: new Version('1.4.0', '1.0'),
        allow: new Allow([
          new OperationStatus('SUCCESS', true),
          new OperationStatus('FAILURE', false),
        ], ['PAYMENT']),
      });

      let asserter;

      try {
        asserter = RosettaSDK.Asserter.NewClientWithResponses(
          networkIdentifier,
          networkStatusResponse,
          networkOptionsResponse,
        );
      } catch (e) {
        console.error(e);
      }

      it(`should pass test case '${testName}'`, async function () {
        expect(asserter).to.not.equal(undefined);

        let thrown = false;

        try {
          asserter.Block(testParams.block);
        } catch (e) {
          // console.error(e);
          expect(e.message).to.equal(testParams.err);
          thrown = true;   
        }

        expect(thrown).to.equal(testParams.err != null);
      });      

    }
  });

  describe('Test Server', function () {
    const {
      NetworkIdentifier,
      AccountBalanceRequest,
      PartialBlockIdentifier,
      TransactionIdentifier,
      AccountIdentifier,
      Currency,
      OperationIdentifier,
      Operation,
      BlockIdentifier,
      BlockTransactionRequest,
      ConstructionMetadataRequest,
      ConstructionSubmitRequest,
      MempoolTransactionRequest,
      BlockRequest,
      MetadataRequest,
      NetworkRequest,
      Amount,
    } = RosettaSDK.Client;

    const validNetworkIdentifier = NetworkIdentifier.constructFromObject({
      blockchain: 'Bitcoin',
      network: 'Mainnet',
    });

    const wrongNetworkIdentifier = NetworkIdentifier.constructFromObject({
      blockchain: 'Bitcoin',
      network: 'Testnet',
    });

    const validAccountIdentifier = new AccountIdentifier('acct1');

    const genesisBlockIndex = 0;
    const validBlockIndex = 1000;
    const validPartialBlockIdentifier = PartialBlockIdentifier.constructFromObject({
      index: validBlockIndex,
    });

    const validBlockIdentifier = BlockIdentifier.constructFromObject({
        index: validBlockIndex,
        hash: 'block 1',
      })

    const validTransactionIdentifier = new TransactionIdentifier('tx1');

    /*
    const validPublicKey = PublicKey.constructFromObject({
      bytes: []byte('hello'),
      curve_type: Secp256k1,
    })
    */

    const validAmount = Amount.constructFromObject({
      value: '1000',
      currency: Currency.constructFromObject({
        symbol: 'BTC',
        decimals: 8,
      }),
    });

    const validAccount = new AccountIdentifier('test');

    const validOps = [
      Operation.constructFromObject({
        operation_identifier: new OperationIdentifier(0),
        type: 'PAYMENT',
        account: validAccount,
        amount: validAmount,
      }),
      Operation.constructFromObject({
        operation_identifier: new OperationIdentifier(1),
        related_operations: [
          new OperationIdentifier(0),
        ],
        type: 'PAYMENT',
        account: validAccount,
        amount: validAmount,
      }),
    ];

    const unsupportedTypeOps = [
      Operation.constructFromObject({
        operation_identifier: new OperationIdentifier(0),
        type: 'STAKE',
        account: validAccount,
        amount: validAmount,
      }),
      Operation.constructFromObject({
        operation_identifier: new OperationIdentifier(1),
        related_operations: [
          new OperationIdentifier(0),
        ],
        type: 'PAYMENT',
        account: validAccount,
        amount: validAmount,
      }),
    ];

    const invalidOps = [
      Operation.constructFromObject({
        operation_identifier: new OperationIdentifier(0),
        type: 'PAYMENT',
        status: 'SUCCESS',
        account: validAccount,
        amount: validAmount,
      }),
      Operation.constructFromObject({
        operation_identifier: new OperationIdentifier(1),
        related_operations: [
          new OperationIdentifier(0),
        ],
        type: 'PAYMENT',
        status: 'SUCCESS',
        account: validAccount,
        amount: validAmount,
      }),
    ];

    /*
    const validSignatures = [
      {
        signing_payload: &types.SigningPayload{
          address: validAccount.Address,
          bytes: []byte('blah'),
        },
        public_key: validPublicKey,
        signature_type: types.Ed25519,
        bytes: []byte('hello'),
      },
    ];

    const signatureTypeMismatch = [
      {
        signing_payload: &types.SigningPayload{
          address: validAccount.Address,
          bytes: []byte('blah'),
          signature_type: types.EcdsaRecovery,
        },
        public_key: validPublicKey,
        signature_type: types.Ed25519,
        bytes: []byte('hello'),
      },
    ];

    const signatureTypeMatch = [
      {
        signing_payload: &types.SigningPayload{
          address: validAccount.Address,
          bytes: []byte('blah'),
          signature_type: types.Ed25519,
        },
        public_key: validPublicKey,
        signature_type: types.Ed25519,
        bytes: []byte('hello'),
      },
    ];

    const emptySignature = [
      {
        signing_payload: &types.SigningPayload{
          address: validAccount.Address,
          bytes: []byte('blah'),
          signature_type: types.Ed25519,
        },
        public_key: validPublicKey,
        signature_type: types.Ed25519,
      },
    ];
    */    

    const asserter = RosettaSDK.Asserter.NewServer(
      ['PAYMENT'],
      true, // allowHistorical
      [validNetworkIdentifier],
    );

    describe('Test SupportedNetworks', function () {
      it('should assert valid network identifiers correctly', async function () {
        let thrown = false;

        const networks = [
          validNetworkIdentifier,
          wrongNetworkIdentifier,
        ];

        try {
          asserter.SupportedNetworks(networks);
        } catch (e) {
          console.error(e);
          thrown = true; 
        }

        expect(thrown).to.equal(false);
      });

      it('should throw when passing no networks', async function () {
        let thrown = false;

        const networks = [
        ];

        try {
          asserter.SupportedNetworks(networks);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('NetworkIdentifier Array contains no supported networks');
          thrown = true; 
        }

        expect(thrown).to.equal(true);
      });

      it('should throw when returning an invalid network', async function () {
        let thrown = false;

        const networks = [
          new NetworkIdentifier('blah'),
        ];

        try {
          asserter.SupportedNetworks(networks);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('NetworkIdentifier.network is missing');          
          thrown = true; 
        }

        expect(thrown).to.equal(true);
      });

      it('should throw when returning duplicate networks', async function () {
        let thrown = false;

        const networks = [
          validNetworkIdentifier,
          validNetworkIdentifier,
        ];

        try {
          asserter.SupportedNetworks(networks);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('SupportedNetwork has a duplicate: {"blockchain":"Bitcoin","network":"Mainnet"}');             
          thrown = true; 
        }

        expect(thrown).to.equal(true);
      });      
    });

    describe('Test AccountBalanceRequest', function () {
      const createServer = (allowHistorical) => {
        const server = RosettaSDK.Asserter.NewServer(
          ['PAYMENT'],
          allowHistorical,
          [validNetworkIdentifier],
        );

        return server;        
      }

      it('should assert valid balance request correctly', async function () {
        let thrown = false;

        const server = createServer(false);
        const request = new AccountBalanceRequest(validNetworkIdentifier, validAccountIdentifier);

        try {
          server.AccountBalanceRequest(request);
        } catch (e) {
          console.error(e);
          thrown = true; 
        }

        expect(thrown).to.equal(false);
      });   

      it('should throw when requesting account with invalid network', async function () {
        let thrown = false;

        const server = createServer(false);
        const request = new AccountBalanceRequest(wrongNetworkIdentifier, validAccountIdentifier);

        try {
          server.AccountBalanceRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('Network {"blockchain":"Bitcoin","network":"Testnet"} is not supported');
          thrown = true; 
        }

        expect(thrown).to.equal(true);
      });   

      it('should throw when passing null as a request', async function () {
        let thrown = false;

        const server = createServer(false);
        const request = null;

        try {
          server.AccountBalanceRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('AccountBalanceRequest is null');
          thrown = true; 
        }

        expect(thrown).to.equal(true);
      });     

      it('should throw when passing a request without a network specifier', async function () {
        let thrown = false;

        const server = createServer(false);
        const request = new AccountBalanceRequest(null, validAccountIdentifier);

        try {
          server.AccountBalanceRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('NetworkIdentifier is null');
          thrown = true; 
        }

        expect(thrown).to.equal(true);
      });

      it('should throw when passing a request without an account specifier', async function () {
        let thrown = false;

        const server = createServer(false);
        const request = new AccountBalanceRequest(validNetworkIdentifier, null);

        try {
          server.AccountBalanceRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('Account is null');
          thrown = true; 
        }

        expect(thrown).to.equal(true);
      });

      it('should handle a valid historical request properly', async function () {
        let thrown = false;

        const server = createServer(true);
        const request = new AccountBalanceRequest(validNetworkIdentifier, validAccountIdentifier);

        try {
          server.AccountBalanceRequest(request);
        } catch (e) {
          console.error(e);
          thrown = true; 
        }

        expect(thrown).to.equal(false);
      });     

      it('should throw when passing an invalid historical request', async function () {
        let thrown = false;

        const server = createServer(true);
        const request = new AccountBalanceRequest(validNetworkIdentifier, validAccountIdentifier);
        request.block_identifier = new PartialBlockIdentifier();

        try {
          server.AccountBalanceRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('Neither PartialBlockIdentifier.hash nor PartialBlockIdentifier.index is set');          
          thrown = true; 
        }

        expect(thrown).to.equal(true);
      });   

      it('should throw when historical request is not available', async function () {
        let thrown = false;

        const server = createServer(false);
        const request = new AccountBalanceRequest(validNetworkIdentifier, validAccountIdentifier);
        request.block_identifier = validPartialBlockIdentifier;

        try {
          server.AccountBalanceRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('historical balance loopup is not supported');          
          thrown = true; 
        }

        expect(thrown).to.equal(true);
      });       
    });

    describe('Test BlockRequest', function () {
      it('should assert a valid request properly', async function () {
        let thrown = false;

        const request = new BlockRequest(validNetworkIdentifier, validPartialBlockIdentifier);

        try {
          asserter.BlockRequest(request);
        } catch (e) {
          console.error(e);
          thrown = true; 
        }

        expect(thrown).to.equal(false);
      });

      it('should assert a valid request for block 0 properly', async function () {
        let thrown = false;

        const request = new BlockRequest(validNetworkIdentifier, PartialBlockIdentifier.constructFromObject({
          index: genesisBlockIndex,
        }));

        try {
          asserter.BlockRequest(request);
        } catch (e) {
          console.error(e);
          thrown = true; 
        }

        expect(thrown).to.equal(false);
      });

      it('should throw when requesting an invalid network', async function () {
        let thrown = false;

        const request = new BlockRequest(wrongNetworkIdentifier, validPartialBlockIdentifier);

        try {
          asserter.BlockRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('Network {"blockchain":"Bitcoin","network":"Testnet"} is not supported');
          thrown = true; 
        }

        expect(thrown).to.equal(true);
      });

      it('should throw when passing null', async function () {
        let thrown = false;

        const request = null;

        try {
          asserter.BlockRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('BlockRequest is null');
          thrown = true; 
        }

        expect(thrown).to.equal(true);
      });

      it('should throw when requesting a block without a network specifier', async function () {
        let thrown = false;

        const request = new BlockRequest();
        request.block_identifier = validPartialBlockIdentifier;

        try {
          asserter.BlockRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('NetworkIdentifier is null');
          thrown = true; 
        }

        expect(thrown).to.equal(true);
      });      

      it('should throw when requesting a block without a block identifier', async function () {
        let thrown = false;

        const request = new BlockRequest(validNetworkIdentifier);

        try {
          asserter.BlockRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('PartialBlockIdentifier is null');
          thrown = true; 
        }

        expect(thrown).to.equal(true);
      });       

      it('should throw when requesting an invalid partialBlockIdentifier', async function () {
        let thrown = false;

        const request = new BlockRequest(validNetworkIdentifier, new PartialBlockIdentifier());

        try {
          asserter.BlockRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('Neither PartialBlockIdentifier.hash nor PartialBlockIdentifier.index is set');
          thrown = true; 
        }

        expect(thrown).to.equal(true);
      });    
    });

    describe('Test BlockTransactionRequest', function () {
      it('should assert a valid request properly', async function () {
        let thrown = false;

        const request = new BlockTransactionRequest(
          validNetworkIdentifier,
          validBlockIdentifier,
          validTransactionIdentifier
        );

        try {
          asserter.BlockTransactionRequest(request);
        } catch (e) {
          console.error(e);
          thrown = true; 
        }

        expect(thrown).to.equal(false);        
      });

      it('should throw when passing an invalid network', async function () {
        let thrown = false;

        const request = new BlockTransactionRequest(
          wrongNetworkIdentifier,
          validBlockIdentifier,
          validTransactionIdentifier
        );

        try {
          asserter.BlockTransactionRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('Network {"blockchain":"Bitcoin","network":"Testnet"} is not supported');
          thrown = true; 
        }

        expect(thrown).to.equal(true);        
      });

      it('should throw when passing null', async function () {
        let thrown = false;

        const request = null;

        try {
          asserter.BlockTransactionRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('BlockTransactionRequest is null');
          thrown = true; 
        }

        expect(thrown).to.equal(true);        
      });    

      it('should throw when the request is missing a network', async function () {
        let thrown = false;

        const request = new BlockTransactionRequest(
          null,
          validBlockIdentifier,
          validTransactionIdentifier
        );

        try {
          asserter.BlockTransactionRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('NetworkIdentifier is null');
          thrown = true; 
        }

        expect(thrown).to.equal(true);        
      });

      it('should throw when the request is missing a block identifier', async function () {
        let thrown = false;

        const request = new BlockTransactionRequest(
          validNetworkIdentifier,
          null,
          validTransactionIdentifier
        );

        try {
          asserter.BlockTransactionRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('BlockIdentifier is null');
          thrown = true; 
        }

        expect(thrown).to.equal(true);        
      });    

      it('should throw when the request\'s blockIdentifier is invalid', async function () {
        let thrown = false;

        const request = new BlockTransactionRequest(
          validNetworkIdentifier,
          new BlockIdentifier(),
        );

        try {
          asserter.BlockTransactionRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('BlockIdentifier.hash is missing');
          thrown = true; 
        }

        expect(thrown).to.equal(true);        
      });   
    });

    describe('Test ConstructionMetadataRequest', function () {
      it('should assert a valid request properly', async function () {
        let thrown = false;

        const request = new ConstructionMetadataRequest(
          validNetworkIdentifier,
          {}, // options
        );

        try {
          asserter.ConstructionMetadataRequest(request);
        } catch (e) {
          console.error(e);
          thrown = true; 
        }

        expect(thrown).to.equal(false); 
      });

      it('should throw when a wrong network was specified', async function () {
        let thrown = false;

        const request = new ConstructionMetadataRequest(
          wrongNetworkIdentifier,
          {}, // options
        );

        try {
          asserter.ConstructionMetadataRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('Network {"blockchain":"Bitcoin","network":"Testnet"} is not supported');
          thrown = true; 
        }

        expect(thrown).to.equal(true); 
      });  

      it('should throw when the request is null', async function () {
        let thrown = false;

        const request = null;

        try {
          asserter.ConstructionMetadataRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('ConstructionMetadataRequest is null');
          thrown = true; 
        }

        expect(thrown).to.equal(true); 
      });        

      it('should throw when the request is missing a network', async function () {
        let thrown = false;

        const request = new ConstructionMetadataRequest(
          null,
          {}, // options
        );

        try {
          asserter.ConstructionMetadataRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('NetworkIdentifier is null');
          thrown = true; 
        }

        expect(thrown).to.equal(true); 
      });    

      it('should throw when the request is missing options', async function () {
        let thrown = false;

        const request = new ConstructionMetadataRequest(
          validNetworkIdentifier,
          null,
        );

        try {
          asserter.ConstructionMetadataRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('ConstructionMetadataRequest.options is null');
          thrown = true; 
        }

        expect(thrown).to.equal(true); 
      });  
    });

    describe('Test ConstructionSubmitRequest', function () {
      it('should assert the request properly', async function () {
        let thrown = false;

        const request = new ConstructionSubmitRequest(
          validNetworkIdentifier,
          'tx',
        );

        try {
          asserter.ConstructionSubmitRequest(request);
        } catch (e) {
          console.error(e);
          thrown = true; 
        }

        expect(thrown).to.equal(false); 
      });  

      it('should throw when the request is missing options', async function () {
        let thrown = false;

        const request = new ConstructionSubmitRequest(
          wrongNetworkIdentifier,
          'tx',
        );

        try {
          asserter.ConstructionSubmitRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('Network {"blockchain":"Bitcoin","network":"Testnet"} is not supported');
          thrown = true; 
        }

        expect(thrown).to.equal(true); 
      });  

      it('should throw the request is null', async function () {
        let thrown = false;

        const request = null;

        try {
          asserter.ConstructionSubmitRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('ConstructionSubmitRequest.options is null');
          thrown = true; 
        }

        expect(thrown).to.equal(true); 
      });  

      it('should throw when the request has no transaction', async function () {
        let thrown = false;

        const request = new ConstructionSubmitRequest(
        );

        try {
          asserter.ConstructionSubmitRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('NetworkIdentifier is null');
          thrown = true; 
        }

        expect(thrown).to.equal(true); 
      });  
    });

    describe('Test MempoolTransactionRequest', function () {
      it('should assert a valid request properly', async function () {
        let thrown = false;

        const request = new MempoolTransactionRequest(
          validNetworkIdentifier,
          validTransactionIdentifier,
        );

        try {
          asserter.MempoolTransactionRequest(request);
        } catch (e) {
          console.error(e);
          thrown = true; 
        }

        expect(thrown).to.equal(false);         
      });

      it('should throw when the specified network not supported', async function () {
        let thrown = false;

        const request = new MempoolTransactionRequest(
          wrongNetworkIdentifier,
          validTransactionIdentifier,
        );

        try {
          asserter.MempoolTransactionRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('Network {"blockchain":"Bitcoin","network":"Testnet"} is not supported');
          thrown = true; 
        }

        expect(thrown).to.equal(true);         
      });  

      it('should throw then the request is null', async function () {
        let thrown = false;

        const request = null;

        try {
          asserter.MempoolTransactionRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('MempoolTransactionRequest is null');
          thrown = true; 
        }

        expect(thrown).to.equal(true);         
      }); 

      it('should throw then the request is missing a network', async function () {
        let thrown = false;

        const request = new MempoolTransactionRequest(
          null,
          validTransactionIdentifier,
        );;

        try {
          asserter.MempoolTransactionRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('NetworkIdentifier is null');
          thrown = true; 
        }

        expect(thrown).to.equal(true);         
      });  

      it('should throw when the TransactionIdentifier is invalid', async function () {
        let thrown = false;

        const request = new MempoolTransactionRequest(
          validNetworkIdentifier,
          new TransactionIdentifier(),
        );

        try {
          asserter.MempoolTransactionRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('TransactionIdentifier.hash is missing');
          thrown = true; 
        }

        expect(thrown).to.equal(true);         
      });    
    });

    describe('Test MetadataRequest', function () {
      it('should assert a valid request properly', async function () {
        let thrown = false;

        const request = new MetadataRequest();

        try {
          asserter.MetadataRequest(request);
        } catch (e) {
          // console.error(e);
          thrown = true; 
        }

        expect(thrown).to.equal(false);   
      });

      it('should throw when the request is null', async function () {
        let thrown = false;

        const request = null;

        try {
          asserter.MempoolTransactionRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('MempoolTransactionRequest is null');
          thrown = true; 
        }

        expect(thrown).to.equal(true);   
      });      
    });

    describe('Test NetworkRequest', function () {
      it('should assert a valid request properly', async function () {
        let thrown = false;

        const request = new NetworkRequest(validNetworkIdentifier);

        try {
          asserter.NetworkRequest(request);
        } catch (e) {
          console.error(e);
          thrown = true; 
        }

        expect(thrown).to.equal(false);   
      });

      it('should throw when the request has a unsupported network identifier', async function () {
        let thrown = false;

        const request = new NetworkRequest(wrongNetworkIdentifier);

        try {
          asserter.NetworkRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('Network {"blockchain":"Bitcoin","network":"Testnet"} is not supported');
          thrown = true; 
        }

        expect(thrown).to.equal(true);   
      });    

      it('should throw when the request is null', async function () {
        let thrown = false;

        const request = null;

        try {
          asserter.NetworkRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('NetworkRequest is null');
          thrown = true; 
        }

        expect(thrown).to.equal(true);   
      });    

      it('should throw when the request is missing a network', async function () {
        let thrown = false;

        const request = new NetworkRequest();

        try {
          asserter.NetworkRequest(request);
        } catch (e) {
          // console.error(e);
          expect(e.name).to.equal('AsserterError');
          expect(e.message).to.equal('NetworkIdentifier is null');
          thrown = true; 
        }

        expect(thrown).to.equal(true);   
      });                  
    });  

    describe('Test ConstructionDeriveRequest', function () { 
      // ToDo        
    });  

    describe('Test ConstructionPreprocessRequest', function () { 
      // ToDo        
    });  

    describe('Test ConstructionPayloadsRequest', function () { 
      // ToDo        
    });  

    describe('Test ConstructionCombineRequest', function () { 
      // ToDo        
    });  

    describe('Test ConstructionHashRequest', function () { 
      // ToDo        
    });  

    describe('Test ConstructionParseRequest', function () { 
      // ToDo        
    });    
  });

  describe('Contains Currency', function () {
    const asserter = new RosettaSDK.Asserter();

    it('should properly check if a currency is contained', async function () {
      const toFind = new T.Currency('BTC', 8);

      const currencies = [
        new T.Currency('BTC', 8),
      ];

      const result = asserter.containsCurrency(currencies, toFind);

      expect(result).to.equal(true);
    });

    it('should handle complex contains', async function () {
      const toFind = T.Currency.constructFromObject({
        symbol: 'BTC',
        decimals: 8,
        metadata: {
          'blah': 'hello',
        },
      });
      
      const currencies = [
        T.Currency.constructFromObject({
          symbol: 'BTC',
          decimals: 8,
          metadata: {
            'blah': 'hello',
          },
        }),
      ];

      const result = asserter.containsCurrency(currencies, toFind);

      expect(result).to.equal(true);
    });    

    it('should handle more complex contains', async function () {
      const toFind = T.Currency.constructFromObject({
        symbol: 'BTC',
        decimals: 8,
        metadata: {
          'blah': 'hello',
          'blah2': 'bye',
        },
      });
      
      const currencies = [
        T.Currency.constructFromObject({
          symbol: 'BTC',
          decimals: 8,
          metadata: {
            'blah': 'hello',
            'blah2': 'bye',
          },
        }),
      ];

      const result = asserter.containsCurrency(currencies, toFind);

      expect(result).to.equal(true);
    });     

    it('should not find a currency in an empty currency array', async function () {
      const toFind = T.Currency.constructFromObject({
        symbol: 'BTC',
        decimals: 8,
      });
      
      const currencies = [];

      const result = asserter.containsCurrency(currencies, toFind);

      expect(result).to.equal(false);
    });     

    it('should not find a currency with a different symbol', async function () {
      const toFind = T.Currency.constructFromObject({
        symbol: 'BTC',
        decimals: 8,
      });
      
      const currencies = [
        T.Currency.constructFromObject({
          symbol: 'ERX',
          decimals: 8,
        }),
      ];

      const result = asserter.containsCurrency(currencies, toFind);

      expect(result).to.equal(false);
    });    

    it('should not find a currency with different decimals', async function () {
      const toFind = T.Currency.constructFromObject({
        symbol: 'BTC',
        decimals: 8,
      });
      
      const currencies = [
        T.Currency.constructFromObject({
          symbol: 'BTC',
          decimals: 6,
        }),
      ];

      const result = asserter.containsCurrency(currencies, toFind);

      expect(result).to.equal(false);
    });     

    it('should not find a currency with different metadata', async function () {
      const toFind = T.Currency.constructFromObject({
        symbol: 'BTC',
        decimals: 8,
        metadata: {
          'blah': 'hello',
        },
      });
      
      const currencies = [
        T.Currency.constructFromObject({
          symbol: 'BTC',
          decimals: 8,
          metadata: {
            'blah': 'bye',
          },
        }),
      ];

      const result = asserter.containsCurrency(currencies, toFind);

      expect(result).to.equal(false);
    });         
  });

  describe('Account Balance', function () {
    const asserter = new RosettaSDK.Asserter();

    const validBlock = T.BlockIdentifier.constructFromObject({
      index: 1000,
      hash: 'jsakdl',
    });

    const invalidBlock = T.BlockIdentifier.constructFromObject({
      index: 1,
      hash: '',
    });

    const invalidIndex = 1001;
    const invalidHash = 'ajsdk';
    const validAmount = T.Amount.constructFromObject({
      value: '100',
      currency: T.Currency.constructFromObject({
        symbol: 'BTC',
        decimals: 8,
      }),
    });

    it('should properly encode a simple balance', () => {
      let thrown = false;
      try {
        asserter.AccountBalanceResponse(null, validBlock, [ validAmount ]);
      } catch (e) {
        console.error(e);
        thrown = true;
      }

      expect(thrown).to.equal(false);
    });

    it('should detect an invalid block', () => {
      let thrown = false;
      try {
        asserter.AccountBalanceResponse(null, invalidBlock, [ validAmount ]);
      } catch (e) {
        // console.error(e);
        expect(e.message).to.equal('BlockIdentifier.hash is missing');
        thrown = true;
      }

      expect(thrown).to.equal(true);
    });

    it('should detect duplicate currencies', () => {
      let thrown = false;
      try {
        asserter.AccountBalanceResponse(null, validBlock, [ validAmount, validAmount ]);
      } catch (e) {
        // console.error(e);
        expect(e.message).to.equal('Currency BTC used in balance multiple times');
        thrown = true;
      }

      expect(thrown).to.equal(true);
    });
    
    it('should assert history request index as valid', () => {
      let thrown = false;
      try {
        const req = T.PartialBlockIdentifier.constructFromObject({
          index: validBlock.index,
        });
        asserter.AccountBalanceResponse(req, validBlock, [ validAmount ]);
      } catch (e) {
        console.error(e);
        thrown = true;
      }

      expect(thrown).to.equal(false);
    });

    it('should assert valid history request hash as valid', () => {
      let thrown = false;
      try {
        const req = T.PartialBlockIdentifier.constructFromObject({
          hash: validBlock.hash,
        });
        asserter.AccountBalanceResponse(req, validBlock, [ validAmount ]);
      } catch (e) {
        console.error(e);
        thrown = true;
      }

      expect(thrown).to.equal(false);
    });

    it('should assert valid history request as valid', () => {
      let thrown = false;
      try {
        const req = constructPartialBlockIdentifier(validBlock);
        asserter.AccountBalanceResponse(req, validBlock, [ validAmount ]);
      } catch (e) {
        console.error(e);
        thrown = true;
      }

      expect(thrown).to.equal(false);
    });    

    it('should assert valid history request index as invalid', () => {
      let thrown = false;
      try {
        const req = T.PartialBlockIdentifier.constructFromObject({
          hash: validBlock.hash,
          index: invalidIndex,
        });
        asserter.AccountBalanceResponse(req, validBlock, [ validAmount ]);
      } catch (e) {
        // console.error(e);
        expect(e.message).to.equal('Request Index 1001 does not match Response block index 1000');
        thrown = true;
      }

      expect(thrown).to.equal(true);
    });    

    it('should assert invalid historical request hash as invalid', () => {
      let thrown = false;
      try {
        const req = T.PartialBlockIdentifier.constructFromObject({
          hash: invalidHash,
          index: validBlock.index,
        });
        asserter.AccountBalanceResponse(req, validBlock, [ validAmount ]);
      } catch (e) {
        // console.error(e);
        expect(e.message).to.equal('Request BlockHash ajsdk does not match Response block hash jsakdl');
        thrown = true;
      }

      expect(thrown).to.equal(true);
    });     
  });
});