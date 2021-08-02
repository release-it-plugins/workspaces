function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rejectAfter(ms, error) {
  await sleep(ms);

  throw error;
}

module.exports = {
  rejectAfter,
};
