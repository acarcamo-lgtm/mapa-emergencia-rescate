import { describe, expect, it } from "vitest";
import {
  hashPhotoBytes,
  parsePhotoDataUrl,
  photoHashKey,
} from "@/lib/photo-hash";

describe("photo-hash", () => {
  it("calcula el mismo hash para los mismos bytes aunque cambie el data URL", () => {
    const bytes = Buffer.from("demo image bytes");
    const base64 = bytes.toString("base64");

    const parsed = parsePhotoDataUrl(`data:image/png;base64,${base64}`);

    expect(parsed?.hash).toBe(hashPhotoBytes(bytes));
    expect(parsed?.contentType).toBe("image/png");
    expect(parsed?.ext).toBe("png");
  });

  it("rechaza formatos que no son imagenes soportadas", () => {
    const base64 = Buffer.from("not an image").toString("base64");

    expect(parsePhotoDataUrl(`data:text/plain;base64,${base64}`)).toBeNull();
    expect(parsePhotoDataUrl("not-a-data-url")).toBeNull();
  });

  it("convierte el hash a una clave segura para R2", () => {
    expect(photoHashKey("sha256:abcdef")).toBe("abcdef");
  });
});
