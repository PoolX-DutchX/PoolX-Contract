function isException(error) {
  let strError = error.toString()
  return (
    strError.includes('invalid opcode') ||
    strError.includes('invalid JUMP') ||
    strError.includes('revert')
  )
}

function ensuresException(error) {
  assert(isException(error), error.toString())
}

module.exports = {
  ensuresException,
}
