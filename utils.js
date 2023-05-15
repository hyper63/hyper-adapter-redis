import { crocks, isHyperErr, R } from './deps.js'

const { Async } = crocks
const { ifElse } = R

export const handleHyperErr = ifElse(
  isHyperErr,
  Async.Resolved,
  Async.Rejected,
)
