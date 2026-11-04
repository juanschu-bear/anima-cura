import { execFileSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { buildFormSignatureFinalizationArtifacts } from "@/lib/services/animasign-form-signature-finalization";

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    const byte = buffer[index];
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function createAnonymousSignaturePng() {
  const width = 600;
  const height = 120;
  const pixels = Buffer.alloc(width * height * 4, 0);

  const dot = (x: number, y: number, radius = 2) => {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const px = Math.round(x + dx);
        const py = Math.round(y + dy);
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        const offset = (py * width + px) * 4;
        pixels[offset] = 20;
        pixels[offset + 1] = 44;
        pixels[offset + 2] = 39;
        pixels[offset + 3] = 255;
      }
    }
  };
  const line = (from: [number, number], to: [number, number]) => {
    const steps = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]));
    for (let step = 0; step <= steps; step += 1) {
      const ratio = steps === 0 ? 0 : step / steps;
      dot(from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio);
    }
  };

  const strokes: Array<Array<[number, number]>> = [
    [[35, 82], [68, 28], [88, 88], [111, 42], [136, 78], [162, 34], [181, 76]],
    [[160, 76], [214, 52], [256, 70], [305, 44], [346, 68], [402, 48], [468, 65]],
    [[255, 88], [305, 81], [355, 86], [420, 80], [515, 84]],
  ];
  for (const stroke of strokes) {
    for (let index = 1; index < stroke.length; index += 1) {
      line(stroke[index - 1], stroke[index]);
    }
  }

  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    raw[rowOffset] = 0;
    pixels.copy(raw, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function main() {
  const outputPath = resolve(
    process.argv[2] ?? "output/pdf/animasign-formularabschluss-anonymisiert.pdf",
  );
  const directory = await mkdtemp(join(tmpdir(), "animasign-sample-"));
  const keyPath = join(directory, "key.pem");
  const certPath = join(directory, "certificate.pem");
  const p12Path = join(directory, "certificate.p12");
  const passphrase = "animasign-anonymous-sample";

  try {
    execFileSync(
      "openssl",
      [
        "req", "-x509", "-newkey", "rsa:2048", "-keyout", keyPath,
        "-out", certPath, "-days", "7", "-nodes",
        "-subj", "/CN=Anonymisiertes AnimaSign Beispiel/O=Nur Sichtpruefung",
      ],
      { stdio: "ignore" },
    );
    execFileSync(
      "openssl",
      [
        "pkcs12", "-export", "-out", p12Path, "-inkey", keyPath,
        "-in", certPath, "-passout", `pass:${passphrase}`,
      ],
      { stdio: "ignore" },
    );

    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]);
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    page.drawText("Anamnesebogen - anonymisiertes Beispiel", {
      x: 52, y: 780, size: 19, font: bold, color: rgb(0.13, 0.17, 0.15),
    });
    page.drawText("Dieses Dokument enthält ausschließlich Testdaten.", {
      x: 52, y: 744, size: 12, font: regular, color: rgb(0.42, 0.47, 0.44),
    });
    page.drawText("Patient: Erika Beispiel", { x: 52, y: 690, size: 12, font: regular });
    page.drawText("Geburtsdatum: 01.01.2000", { x: 52, y: 664, size: 12, font: regular });
    page.drawText("Formularinhalt: Testdaten zur technischen Sichtprüfung", {
      x: 52, y: 620, size: 12, font: regular,
    });

    const signature = createAnonymousSignaturePng();
    const artifacts = await buildFormSignatureFinalizationArtifacts({
      renderedPdf: Buffer.from(await doc.save()),
      patientName: "Erika Beispiel",
      signatureDataUrl: `data:image/png;base64,${signature.toString("base64")}`,
      location: "Leipzig",
      signedDate: "2026-11-04",
      submittedAt: "2026-11-04T16:30:00.000Z",
      certificate: await readFile(p12Path),
      passphrase,
    });

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, artifacts.signedPdf);
    console.log(outputPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

