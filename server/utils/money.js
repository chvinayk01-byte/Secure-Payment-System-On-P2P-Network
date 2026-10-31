function rupeesToPaise(value) {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error("Amount must be a number or string.");
  }

  const amount = String(value).trim();

  // Accept only non-negative decimal amounts with at most 2 decimal places.
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
    throw new Error("Enter a valid amount with at most 2 decimal places.");
  }

  const [rupeesPart, paisePart = ""] = amount.split(".");

  const rupees = Number(rupeesPart);
  const paise = Number(paisePart.padEnd(2, "0"));

  const totalPaise = rupees * 100 + paise;

  if (!Number.isSafeInteger(totalPaise) || totalPaise <= 0) {
    throw new Error("Amount must be greater than zero and within the allowed range.");
  }

  return totalPaise;
}

function paiseToRupees(paise) {
  if (!Number.isSafeInteger(paise)) {
    throw new Error("Paise must be a safe integer.");
  }

  return (paise / 100).toFixed(2);
}

module.exports = {
  rupeesToPaise,
  paiseToRupees,
};