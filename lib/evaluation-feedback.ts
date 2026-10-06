function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function legacyFeedbackSection(label: string, value: string) {
  const content = escapeHtml(value).replace(/\r?\n/g, "<br>");
  return `<p><strong>${label}:</strong> ${content}</p>`;
}

export function combineTaskFeedback(comment?: string, correction?: string) {
  const normalizedComment = comment?.trim() || "";
  const normalizedCorrection = correction?.trim() || "";

  if (normalizedComment && normalizedCorrection) {
    return [
      legacyFeedbackSection("Correction", normalizedCorrection),
      legacyFeedbackSection("Instructor comment", normalizedComment),
    ].join("");
  }
  if (normalizedCorrection) return legacyFeedbackSection("Correction", normalizedCorrection);
  return normalizedComment;
}
