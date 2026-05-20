// ─── Economy (No Phaser imports) ───
// Stub: basic money tracking for the vertical slice.

export class Economy {
  private _balance: number;

  constructor(startingMoney: number = 4) {
    this._balance = startingMoney;
  }

  get balance(): number {
    return this._balance;
  }

  earn(amount: number): void {
    this._balance += amount;
  }

  spend(amount: number, minBalance: number = 0): boolean {
    if (this._balance - amount < minBalance) return false;
    this._balance -= amount;
    return true;
  }

  setBalance(amount: number): void {
    this._balance = amount;
  }
}
