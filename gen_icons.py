import struct, zlib

def create_png(width, height, r, g, b):
    """Create a minimal solid-color PNG file."""
    def chunk(chunk_type, data):
        c = chunk_type + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    
    header = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
    
    raw = b''
    for y in range(height):
        raw += b'\x00'  # filter byte
        for x in range(width):
            raw += struct.pack('BBB', r, g, b)
    
    idat = chunk(b'IDAT', zlib.compress(raw))
    iend = chunk(b'IEND', b'')
    return header + ihdr + idat + iend

# Create 192x192 icon
with open('assets/icon-192.png', 'wb') as f:
    f.write(create_png(192, 192, 19, 21, 26))  # dark bg

# Create 512x512 icon
with open('assets/icon-512.png', 'wb') as f:
    f.write(create_png(512, 512, 19, 21, 26))

print("✅ Icons created successfully!")
