import * as fs from "fs";
import { globalAgent } from "https";
import * as path from "path";

// @ts-ignore
import { systemCertsAsync } from "system-ca";

function loadCompanyCertificates(): string[] {
  const certs: string[] = [];

  try {
    // Define paths where your company certificates might be stored
    const certPaths = [
      // Add paths to your company certificates here
      path.join(__dirname, "..", "..", "certs", "company-root-ca.crt"),
      path.join(__dirname, "..", "..", "certs", "openshift-ca.crt"),
      // You can also use environment variables
      process.env.COMPANY_ROOT_CA_PATH,
      process.env.OPENSHIFT_CA_PATH,
    ].filter(Boolean) as string[];

    for (const certPath of certPaths) {
      if (fs.existsSync(certPath)) {
        const cert = fs.readFileSync(certPath, "utf8");
        certs.push(cert);
        console.log(`Loaded company certificate: ${certPath}`);
      }
    }
  } catch (error) {
    console.warn("Error loading company certificates:", error);
  }

  return certs;
}

export async function setupCa() {
  try {
    // Load company certificates first
    const companyCerts = loadCompanyCertificates();

    switch (process.platform) {
      case "darwin":
        // https://www.npmjs.com/package/mac-ca#usage
        const macCa = await import("mac-ca");
        macCa.addToGlobalAgent();
        break;
      case "win32":
        // https://www.npmjs.com/package/win-ca#caveats
        const winCa = await import("win-ca");
        winCa.inject("+");
        break;
      default:
        // https://www.npmjs.com/package/system-ca
        globalAgent.options.ca = await systemCertsAsync();
        break;
    }

    // Add company certificates to the global agent
    if (companyCerts.length > 0) {
      const existingCa = globalAgent.options.ca;
      if (Array.isArray(existingCa)) {
        globalAgent.options.ca = [...existingCa, ...companyCerts];
      } else if (existingCa) {
        globalAgent.options.ca = [existingCa, ...companyCerts];
      } else {
        globalAgent.options.ca = companyCerts;
      }
      console.log(
        `Added ${companyCerts.length} company certificate(s) to global agent`,
      );
    }
  } catch (e) {
    console.warn("Failed to setup CA: ", e);
  }
}
