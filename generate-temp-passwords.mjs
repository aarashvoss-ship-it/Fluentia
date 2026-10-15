import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

const emails = [
  "aarashvoss@gmail.com",
  "aarashvossoughi@gmail.com",
  "f.soheilikia.lastqueen2002@gmail.com",
];

const hashes = {};
const credentials = [];

for (const email of emails) {
  const temporaryPassword = randomBytes(24).toString("base64url");
  hashes[email] = await bcrypt.hash(temporaryPassword, 12);
  credentials.push({ email, temporaryPassword });
}

console.log("Temporary credentials (share each only with its account holder):");
console.log(JSON.stringify(credentials, null, 2));
console.log("\nSet this server-side Paasta environment variable:");
console.log(`TEMP_USER_PASSWORD_HASHES_B64=${Buffer.from(JSON.stringify(hashes)).toString("base64")}`);
