function formatEtherFromWei(hexWei) {
  const wei = BigInt(hexWei || "0x0");
  const base = 10n ** 18n;
  const whole = wei / base;
  const fraction = wei % base;

  if (wei === 0n) return "0.0";
  if (fraction === 0n) return whole.toString();

  const fractionText = fraction.toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole}.${fractionText}`;
}

module.exports = { formatEtherFromWei };
