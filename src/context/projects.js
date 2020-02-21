import { UNISWAP_POOLS } from './data/uniswap-pools'

export const MODULES = [
  evalUniswapPool
]

export function findProject (addr) {
  for (let i = 0; i < MODULES.length; i++) {
    const mod = MODULES[i]
    const res = mod(addr)
    if (res) {
      return res
    }
  }

  return undefined
}

export function evalUniswapPool (addr) {
  if (UNISWAP_POOLS.includes(addr.toLowerCase())) {
    return {
      title: 'Uniswap pool',
      flags: ''
    }
  }

  return undefined
}
