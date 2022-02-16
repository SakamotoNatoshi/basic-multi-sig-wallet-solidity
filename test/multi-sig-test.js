const chai = require("chai");
chai.use(require("chai-as-promised"));

const expect = chai.expect;

// artifacts.require is provided by Truffle
const MultiSigWallet = artifacts.require("MultiSigWallet");

contract("MultiSigWallet", (accounts) => {
  const owners = [accounts[0], accounts[1], accounts[2]];
  const requiredApprovalCount = 2;

  let wallet;
  beforeEach(async () => {
    wallet = await MultiSigWallet.new(owners, requiredApprovalCount);
  });

  describe("Deploying", () => {
    it("should deploy", async () => {
      const wallet = await MultiSigWallet.new(
        owners,
        requiredApprovalCount
      );

      for (let i = 0; i < owners.length; i++) {
        assert.equal(await wallet.owners(i), owners[i]);
      }

      assert.equal(
        await wallet.requiredApprovalCount(),
        requiredApprovalCount
      );
    });

    it("should reject if no owners", async () => {
      await expect(MultiSigWallet.new([], requiredApprovalCount)).to.be
        .rejected;
    });

    it("should reject if num conf required > owners", async () => {
      await expect(MultiSigWallet.new(owners, owners.length + 1)).to.be
        .rejected;
    });

    it("should reject if owners not unique", async () => {
      await expect(
        MultiSigWallet.new([owners[0], owners[0]], requiredApprovalCount)
      ).to.be.rejected;
    });
  });

  describe("Fallback", async () => {
    it("should receive ether", async () => {
      const { logs } = await wallet.sendTransaction({
        from: accounts[0],
        value: 1,
      });

      assert.equal(logs[0].event, "Deposit");
      assert.equal(logs[0].args.sender, accounts[0]);
      assert.equal(logs[0].args.amount, 1);
      assert.equal(logs[0].args.balance, 1);
    });
  });

  describe("Submit Transaction", () => {
    const to = accounts[3];
    const value = 0;
    const data = "0x0123";

    it("should submit transaction", async () => {
      const { logs } = await wallet.submitTransaction(to, value, data, {
        from: owners[0],
      });

      assert.equal(logs[0].event, "Submission");
      assert.equal(logs[0].args.owner, owners[0]);
      assert.equal(logs[0].args.transactionIndex, 0);
      assert.equal(logs[0].args.to, to);
      assert.equal(logs[0].args.value, value);
      assert.equal(logs[0].args.data, data);

      assert.equal(await wallet.getTransactionCount(), 1);

      const tx = await wallet.getTransaction(0);
      assert.equal(tx.to, to);
      assert.equal(tx.value, value);
      assert.equal(tx.data, data);
      assert.equal(tx.currentApprovalCount, 0);
      assert.equal(tx.executed, false);
    });

    it("should reject if not owner", async () => {
      await expect(
        wallet.submitTransaction(to, value, data, {
          from: accounts[3],
        })
      ).to.be.rejected;
    });
  });

  describe("Approve Transaction", () => {
    beforeEach(async () => {
      const to = accounts[3];
      const value = 0;
      const data = "0x0123";

      await wallet.submitTransaction(to, value, data);
    });

    it("should approve", async () => {
      const { logs } = await wallet.approveTransaction(0, {
        from: owners[0],
      });

      assert.equal(logs[0].event, "Approval");
      assert.equal(logs[0].args.owner, owners[0]);
      assert.equal(logs[0].args.transactionIndex, 0);

      const tx = await wallet.getTransaction(0);
      assert.equal(tx.currentApprovalCount, 1);
    });

    it("should reject if not owner", async () => {
      await expect(
        wallet.approveTransaction(0, {
          from: accounts[3],
        })
      ).to.be.rejected;
    });

    it("should reject if tx does not exist", async () => {
      await expect(
        wallet.approveTransaction(1, {
          from: owners[0],
        })
      ).to.be.rejected;
    });

    it("should reject if already approved", async () => {
      await wallet.approveTransaction(0, {
        from: owners[0],
      });

      await expect(
        wallet.approveTransaction(0, {
          from: owners[0],
        })
      ).to.be.rejected;
    });
  });

  describe("Execute Transaction", () => {
    const to = accounts[3];
    const value = 0;
    const data = "0x00";

    beforeEach(async () => {
      await wallet.submitTransaction(to, value, data);
      await wallet.approveTransaction(0, { from: owners[0] });
      await wallet.approveTransaction(0, { from: owners[1] });
    });

    it("should execute", async () => {
      const { logs } = await wallet.executeTransaction(0);
      // console.log(logs)
      assert.equal(logs[0].event, "Execution");
      assert.equal(logs[0].args.owner, owners[0]);
      assert.equal(logs[0].args.transactionIndex, 0);

      const tx = await wallet.getTransaction(0);
      assert.equal(tx.executed, true);
    });

    it("should reject if already executed", async () => {
      await wallet.executeTransaction(0, {
        from: owners[0],
      });

      await expect(
        wallet.executeTransaction(0, {
          from: owners[0],
        })
      ).to.be.rejected;
    });

    it("should reject if not owner", async () => {
      await expect(
        wallet.executeTransaction(0, {
          from: accounts[3],
        })
      ).to.be.rejected;
    });

    it("should reject if tx does not exist", async () => {
      await expect(
        wallet.executeTransaction(1, {
          from: owners[0],
        })
      ).to.be.rejected;
    });
  });

  describe("Revoke Approval", async () => {
    beforeEach(async () => {
      const to = accounts[3];
      const value = 0;
      const data = "0x00";

      await wallet.submitTransaction(to, value, data);
      await wallet.approveTransaction(0, { from: owners[0] });
    });

    it("should revoke approval", async () => {
      const { logs } = await wallet.revokeApproval(0, {
        from: owners[0],
      });

      assert.equal(logs[0].event, "Revocation");
      assert.equal(logs[0].args.owner, owners[0]);
      assert.equal(logs[0].args.transactionIndex, 0);

      assert.equal(await wallet.isApproved(0, owners[0]), false);

      const tx = await wallet.getTransaction(0);
      assert.equal(tx.currentApprovalCount, 0);
    });

    it("should reject if not owner", async () => {
      await expect(
        wallet.revokeApproval(0, {
          from: accounts[3],
        })
      ).to.be.rejected;
    });

    it("should reject if tx does not exist", async () => {
      await expect(
        wallet.revokeApproval(1, {
          from: owners[0],
        })
      ).to.be.rejected;
    });
  });

  describe("Get Owners", () => {
    it("should return owners", async () => {
      const res = await wallet.getOwners();

      for (let i = 0; i < res.length; i++) {
        assert.equal(res[i], owners[i]);
      }
    });
  });

  describe("Get Transaction Count", () => {
    it("should return tx count", async () => {
      assert.equal(await wallet.getTransactionCount(), 0);
    });
  });
});
