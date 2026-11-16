// From Simple Music v2.7.0. See NOTICE.md and LICENSE.
import { execFileSync } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
const FILE_NAME = "device-identity.json";
let directory = null;
let cachedRoot = null;
function setDeviceIdentityDir(dir) {
  if (directory !== dir) cachedRoot = null;
  directory = dir;
}
function isUsableMachineId(value) {
  const compact = value.replace(/[^0-9a-z]/gi, "").toLowerCase();
  return compact.length >= 16 && !/^(.)\1*$/.test(compact) && compact !== "uninitialized";
}
function commandOutput(file, args) {
  return execFileSync(file, args, { encoding: "utf8", timeout: 3e3, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
}
function parseMachineId(platform, output) {
  const pattern = platform === "darwin" ? /"IOPlatformUUID"\s*=\s*"([^"]+)"/ : /MachineGuid\s+REG_SZ\s+(\S+)/;
  const value = pattern.exec(output)?.[1];
  return value && isUsableMachineId(value) ? value : null;
}
function systemMachineId() {
  try {
    if (process.platform === "darwin") return parseMachineId("darwin", commandOutput("/usr/sbin/ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"]));
    if (process.platform === "win32") return parseMachineId("win32", commandOutput("reg.exe", ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"]));
  } catch {
    return null;
  }
  for (const path of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
    try {
      const value = readFileSync(path, "utf8").trim();
      if (isUsableMachineId(value)) return value;
    } catch {
    }
  }
  return null;
}
function hardwareAddress() {
  const addresses = Object.values(networkInterfaces()).flatMap((list) => list ?? []).filter((item) => !item.internal && item.mac && item.mac !== "00:00:00:00:00:00" && !(parseInt(item.mac.slice(0, 2), 16) & 2)).map((item) => item.mac);
  return addresses.sort()[0] ?? null;
}
function readStore() {
  if (!directory) return {};
  try {
    const value = JSON.parse(readFileSync(join(directory, FILE_NAME), "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}
function writeStore(store) {
  if (!directory) return;
  const file = join(directory, FILE_NAME);
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    mkdirSync(directory, { recursive: true });
    writeFileSync(temporary, JSON.stringify(store), { flag: "wx", mode: 384 });
    renameSync(temporary, file);
  } catch {
  } finally {
    rmSync(temporary, { force: true });
  }
}
function rootSecret() {
  if (cachedRoot) return cachedRoot;
  const machineId = systemMachineId();
  if (machineId) return cachedRoot = machineId;
  const saved = readStore().root;
  if (typeof saved === "string" && saved) return cachedRoot = saved;
  const root = hardwareAddress() ?? randomBytes(32).toString("hex");
  writeStore({ ...readStore(), root });
  return cachedRoot = root;
}
function deriveDeviceHex(root, purpose) {
  return createHmac("sha256", root).update(`simplemusic:${purpose}`).digest("hex");
}
function deriveDeviceDigits(root, purpose, length) {
  const min = 10n ** BigInt(length - 1);
  return String(min + BigInt(`0x${deriveDeviceHex(root, purpose)}`) % (min * 9n));
}
function deviceHex(purpose) {
  return deriveDeviceHex(rootSecret(), purpose);
}
function deviceDigits(purpose, length) {
  return deriveDeviceDigits(rootSecret(), purpose, length);
}
function readStoredDeviceValue(name) {
  const value = readStore()[name];
  return typeof value === "string" ? value : "";
}
function writeStoredDeviceValue(name, value) {
  if (!directory) return;
  const store = readStore();
  if (value) store[name] = value;
  else delete store[name];
  writeStore(store);
}
export {
  deriveDeviceDigits,
  deriveDeviceHex,
  deviceDigits,
  deviceHex,
  isUsableMachineId,
  parseMachineId,
  readStoredDeviceValue,
  setDeviceIdentityDir,
  writeStoredDeviceValue
};
