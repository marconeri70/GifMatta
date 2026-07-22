(function (global) {
  "use strict";

  class SimpleGifEncoder {
    constructor(width, height, options = {}) {
      this.width = Math.max(1, Math.floor(width));
      this.height = Math.max(1, Math.floor(height));
      this.repeat = Number.isInteger(options.repeat) ? options.repeat : 0;
      this.bytes = [];
      this.finished = false;
      this.frameCount = 0;
      this._writeHeader();
    }

    addFrame(rgba, delayMs = 100) {
      if (this.finished) throw new Error("La GIF è già stata completata.");
      if (!rgba || rgba.length < this.width * this.height * 4) {
        throw new Error("Fotogramma non valido.");
      }

      const delayCs = Math.max(1, Math.min(65535, Math.round(delayMs / 10)));

      // Graphic Control Extension
      this._byte(0x21);
      this._byte(0xf9);
      this._byte(0x04);
      this._byte(0x00);
      this._short(delayCs);
      this._byte(0x00);
      this._byte(0x00);

      // Image Descriptor
      this._byte(0x2c);
      this._short(0);
      this._short(0);
      this._short(this.width);
      this._short(this.height);
      this._byte(0x00);

      const indexed = rgbaTo332(rgba, this.width * this.height);
      writeLzwImageData(this, indexed, this.width, this.height, 8);
      this.frameCount += 1;
    }

    finish() {
      if (!this.finished) {
        this._byte(0x3b);
        this.finished = true;
      }
      return Uint8Array.from(this.bytes);
    }

    _writeHeader() {
      this._text("GIF89a");
      this._short(this.width);
      this._short(this.height);
      this._byte(0xf7); // global palette, 8-bit colour resolution, 256 colours
      this._byte(0x00);
      this._byte(0x00);

      // Fixed RGB 3-3-2 palette: fast, reliable and completely offline.
      for (let index = 0; index < 256; index++) {
        const red = Math.round(((index >> 5) & 0x07) * 255 / 7);
        const green = Math.round(((index >> 2) & 0x07) * 255 / 7);
        const blue = Math.round((index & 0x03) * 255 / 3);
        this._byte(red);
        this._byte(green);
        this._byte(blue);
      }

      // Infinite loop unless a different repeat count is supplied.
      this._byte(0x21);
      this._byte(0xff);
      this._byte(0x0b);
      this._text("NETSCAPE2.0");
      this._byte(0x03);
      this._byte(0x01);
      this._short(Math.max(0, this.repeat));
      this._byte(0x00);
    }

    _byte(value) {
      this.bytes.push(value & 0xff);
    }

    _short(value) {
      this._byte(value);
      this._byte(value >> 8);
    }

    _text(value) {
      for (let index = 0; index < value.length; index++) {
        this._byte(value.charCodeAt(index));
      }
    }
  }

  function rgbaTo332(rgba, pixelCount) {
    const indexed = new Uint8Array(pixelCount);
    for (let pixel = 0, offset = 0; pixel < pixelCount; pixel++, offset += 4) {
      const red = rgba[offset];
      const green = rgba[offset + 1];
      const blue = rgba[offset + 2];
      indexed[pixel] = (red & 0xe0) | ((green & 0xe0) >> 3) | (blue >> 6);
    }
    return indexed;
  }

  const LZW_EOF = -1;
  const LZW_BITS = 12;
  const LZW_HSIZE = 5003;
  const LZW_MASKS = [
    0x0000, 0x0001, 0x0003, 0x0007, 0x000f, 0x001f, 0x003f, 0x007f,
    0x00ff, 0x01ff, 0x03ff, 0x07ff, 0x0fff, 0x1fff, 0x3fff, 0x7fff, 0xffff
  ];

  function writeLzwImageData(writer, pixels, width, height, colorDepth) {
    const accum = new Uint8Array(256);
    const htab = new Int32Array(LZW_HSIZE);
    const codetab = new Int32Array(LZW_HSIZE);
    const hsize = htab.length;
    const initCodeSize = Math.max(2, colorDepth);

    accum.fill(0);
    codetab.fill(0);
    htab.fill(-1);

    let curAccum = 0;
    let curBits = 0;
    const initBits = initCodeSize + 1;
    const initialBits = initBits;
    let clearFlag = false;
    let bitSize = initialBits;
    let maxCode = (1 << bitSize) - 1;
    const clearCode = 1 << (initBits - 1);
    const eofCode = clearCode + 1;
    let freeEntry = clearCode + 2;
    let packetCount = 0;
    let entry = pixels[0];
    let hashShift = 0;

    for (let code = hsize; code < 65536; code *= 2) hashShift += 1;
    hashShift = 8 - hashShift;

    writer._byte(initCodeSize);
    output(clearCode);

    for (let pixelIndex = 1; pixelIndex < pixels.length; pixelIndex++) {
      const character = pixels[pixelIndex];
      const fcode = (character << LZW_BITS) + entry;
      let hashIndex = (character << hashShift) ^ entry;

      if (htab[hashIndex] === fcode) {
        entry = codetab[hashIndex];
        continue;
      }

      const displacement = hashIndex === 0 ? 1 : hsize - hashIndex;
      let found = false;
      while (htab[hashIndex] >= 0) {
        hashIndex -= displacement;
        if (hashIndex < 0) hashIndex += hsize;
        if (htab[hashIndex] === fcode) {
          entry = codetab[hashIndex];
          found = true;
          break;
        }
      }
      if (found) continue;

      output(entry);
      entry = character;

      if (freeEntry < (1 << LZW_BITS)) {
        codetab[hashIndex] = freeEntry++;
        htab[hashIndex] = fcode;
      } else {
        htab.fill(-1);
        freeEntry = clearCode + 2;
        clearFlag = true;
        output(clearCode);
      }
    }

    output(entry);
    output(eofCode);
    writer._byte(0x00);

    function output(code) {
      curAccum &= LZW_MASKS[curBits];
      if (curBits > 0) curAccum |= code << curBits;
      else curAccum = code;
      curBits += bitSize;

      while (curBits >= 8) {
        accum[packetCount++] = curAccum & 0xff;
        if (packetCount >= 254) flushPacket();
        curAccum >>= 8;
        curBits -= 8;
      }

      if (freeEntry > maxCode || clearFlag) {
        if (clearFlag) {
          bitSize = initialBits;
          maxCode = (1 << bitSize) - 1;
          clearFlag = false;
        } else {
          bitSize += 1;
          maxCode = bitSize === LZW_BITS ? (1 << bitSize) : (1 << bitSize) - 1;
        }
      }

      if (code === eofCode) {
        while (curBits > 0) {
          accum[packetCount++] = curAccum & 0xff;
          if (packetCount >= 254) flushPacket();
          curAccum >>= 8;
          curBits -= 8;
        }
        if (packetCount > 0) flushPacket();
      }
    }

    function flushPacket() {
      writer._byte(packetCount);
      for (let index = 0; index < packetCount; index++) writer._byte(accum[index]);
      packetCount = 0;
    }
  }


  global.SimpleGifEncoder = SimpleGifEncoder;
})(typeof window !== "undefined" ? window : globalThis);
