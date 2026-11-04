import { createHash, timingSafeEqual, X509Certificate } from "node:crypto";
import { rootCertificates } from "node:tls";
import { NextRequest, NextResponse } from "next/server";

// This route is temporary and read-only. node-forge is already a runtime
// dependency but has no declaration package in this repository.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const forge = require("node-forge") as any;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUTH_HASH = "8ea5c0522f24c5a9af4e278b7d5c8a47578631345cb72c0b8491913a59f5e749";

function authorized(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const actual = Buffer.from(createHash("sha256").update(token).digest("hex"));
  const expected = Buffer.from(AUTH_HASH);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function attribute(cert: any, shortName: string) {
  const value = cert.subject.getField(shortName)?.value;
  return typeof value === "string" ? value : null;
}

function issuerAttribute(cert: any, shortName: string) {
  const value = cert.issuer.getField(shortName)?.value;
  return typeof value === "string" ? value : null;
}

function sameDistinguishedName(left: any, right: any) {
  return JSON.stringify(left.attributes) === JSON.stringify(right.attributes);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const encoded = process.env.PDF_SIGNING_CERT;
  const passphrase = process.env.PDF_SIGNING_PASSPHRASE;
  if (!encoded || !passphrase) {
    return NextResponse.json({ configured: false });
  }

  const der = forge.util.createBuffer(Buffer.from(encoded, "base64").toString("binary"));
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), passphrase);
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const certificates = certBags
    .map((bag: any) => bag.cert)
    .filter((cert: any) => Boolean(cert));
  const leaf = certificates.find((cert: any) => !cert.isIssuer(cert)) ?? certificates[0];
  if (!leaf) {
    return NextResponse.json({ configured: true, readable: false });
  }

  const leafX509 = new X509Certificate(forge.pki.certificateToPem(leaf));
  let selfSigned = false;
  if (sameDistinguishedName(leaf.subject, leaf.issuer)) {
    try {
      selfSigned = leaf.verify(leaf);
    } catch {
      selfSigned = false;
    }
  }

  const systemRoots = rootCertificates.map((pem) => new X509Certificate(pem));
  const chainRoots = certificates.filter((cert: any) => sameDistinguishedName(cert.subject, cert.issuer));
  const chainRootTrusted = chainRoots.some((cert: any) => {
    const candidate = new X509Certificate(forge.pki.certificateToPem(cert));
    return systemRoots.some((root) => root.fingerprint256 === candidate.fingerprint256);
  });
  const directlyTrusted = systemRoots.some((root) => {
    try {
      return leafX509.issuer === root.subject && leafX509.verify(root.publicKey);
    } catch {
      return false;
    }
  });

  return NextResponse.json({
    configured: true,
    readable: true,
    subject: {
      commonName: attribute(leaf, "CN"),
      organization: attribute(leaf, "O"),
      organizationalUnit: attribute(leaf, "OU"),
      country: attribute(leaf, "C"),
    },
    issuer: {
      commonName: issuerAttribute(leaf, "CN"),
      organization: issuerAttribute(leaf, "O"),
      country: issuerAttribute(leaf, "C"),
    },
    validFrom: leaf.validity.notBefore.toISOString(),
    validTo: leaf.validity.notAfter.toISOString(),
    selfSigned,
    recognizedTrustAnchor: chainRootTrusted || directlyTrusted,
    chainCertificates: certificates.length,
  });
}
