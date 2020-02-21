export const BALANCE_OF_ABI = [
  {
    payable: false,
    stateMutability: 'nonpayable',
    type: 'fallback'
  },
  {
    constant: true,
    inputs: [
      {
        internalType: 'address[]',
        name: '_tok',
        type: 'address[]'
      },
      {
        internalType: 'address',
        name: '_addr',
        type: 'address'
      }
    ],
    name: 'safeBalanceOf',
    outputs: [
      {
        internalType: 'uint256[]',
        name: 'r',
        type: 'uint256[]'
      }
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function'
  }
]
