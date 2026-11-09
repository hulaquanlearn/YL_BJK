"""Convert ABB's installed FlexPendant CAD, preserving its two original textures.

Usage: python tools/modeling/convert-flexpendant.py <FlexPendant.rslib> <output dir>
The ABB 3HAC031711-002 display model has 470816 triangles. Faces are merged by
their original material to reduce 6371 source face draws to eight mesh draws.
"""
import argparse
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import struct
import zipfile
from PIL import Image

sp = importlib.util.spec_from_file_location('converter', Path(__file__).with_name('convert-abb-rslib.py'))
converter = importlib.util.module_from_spec(sp)
sp.loader.exec_module(converter)


def convert(source, output):
    z = zipfile.ZipFile(source)
    assert '3HAC031711-002' in z.read('PIM.xml').decode('utf-8-sig')
    faces = converter.graphics(z.read('Streams/3.GfxDataStream.gfx'), include_uv=True)
    gltf = {'asset': {'version': '2.0', 'generator': 'ABB FlexPendant CAD conversion'}, 'scene': 0,
            'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [], 'materials': [], 'accessors': [],
            'bufferViews': [], 'buffers': [], 'images': [], 'textures': []}
    binary = bytearray()

    def view(data, target=None):
        binary.extend(b'\0' * (-len(binary) % 4))
        v = {'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(data)}
        if target:
            v['target'] = target
        binary.extend(data)
        gltf['bufferViews'].append(v)
        return len(gltf['bufferViews']) - 1

    def accessor(values, fmt, dim, component, target):
        data = bytearray()
        for v in values:
            data.extend(struct.pack('<' + fmt * dim, *v) if dim > 1 else struct.pack('<' + fmt, v))
        item = {'bufferView': view(data, target), 'componentType': component, 'count': len(values),
                'type': {1: 'SCALAR', 2: 'VEC2', 3: 'VEC3'}[dim]}
        if target == 34962:
            item['min'] = [min(v[i] for v in values) for i in range(dim)]
            item['max'] = [max(v[i] for v in values) for i in range(dim)]
        gltf['accessors'].append(item)
        return len(gltf['accessors']) - 1

    for texture_id in [1, 2]:
        data = z.read(f'Streams/{texture_id}.TextureStream.tex')
        assert struct.unpack_from('<I', data)[0] == 7
        length = struct.unpack_from('<I', data, 4)[0]
        w, h = struct.unpack_from('<II', data, length + 16)
        pixels = data[length + 25:]
        assert len(pixels) == w * h * 4
        image = Image.frombytes('RGBA', (w, h), pixels, 'raw', 'BGRA')
        buffer = io.BytesIO()
        image.save(buffer, format='PNG')
        gltf['images'].append({'bufferView': view(buffer.getvalue()), 'mimeType': 'image/png'})
        gltf['textures'].append({'source': texture_id - 1})

    for material_id in range(8):
        selected = [f for f in faces if f[5] == material_id]
        if not selected:
            continue
        vertices, normals, indices, uv = [], [], [], []
        for positions, directions, triangles, rgba, coords, _ in selected:
            offset = len(vertices)
            vertices.extend((x / 1000, z / 1000, -y / 1000) for x, y, z in positions)
            normals.extend((x, z, -y) for x, y, z in directions)
            indices.extend(i + offset for i in triangles)
            uv.extend(coords if coords else [(0, 0)] * len(positions))
        assert len(vertices) == len(normals) == len(uv)
        rgba = selected[0][3]
        linear = [c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgba[:3]]
        pbr = {'baseColorFactor': linear + [rgba[3]], 'metallicFactor': .05, 'roughnessFactor': .6}
        if material_id in [3, 6, 7]:
            # Original material 6 maps the narrow hard-key panel; 3/7 the LCD.
            pbr.update({'baseColorFactor': [1, 1, 1, 1], 'baseColorTexture': {'index': 0 if material_id == 6 else 1}})
        material = {'name': 'CAD-material-' + str(material_id), 'pbrMetallicRoughness': pbr, 'doubleSided': True}
        gltf['materials'].append(material)
        primitive = {'attributes': {'POSITION': accessor(vertices, 'f', 3, 5126, 34962),
                                    'NORMAL': accessor(normals, 'f', 3, 5126, 34962),
                                    'TEXCOORD_0': accessor(uv, 'f', 2, 5126, 34962)},
                     'indices': accessor(indices, 'I', 1, 5125, 34963), 'material': len(gltf['materials']) - 1}
        gltf['meshes'].append({'primitives': [primitive]})
        gltf['nodes'].append({'name': 'pendant-material-' + str(material_id), 'mesh': len(gltf['meshes']) - 1,
                              'extras': {'cadMaterial': material_id}})
        gltf['scenes'][0]['nodes'].append(len(gltf['nodes']) - 1)
    gltf['buffers'] = [{'byteLength': len(binary)}]
    metadata = json.dumps(gltf, separators=(',', ':')).encode()
    metadata += b' ' * (-len(metadata) % 4)
    binary.extend(b'\0' * (-len(binary) % 4))
    result = struct.pack('<III', 0x46546C67, 2, 28 + len(metadata) + len(binary))
    result += struct.pack('<I4s', len(metadata), b'JSON') + metadata
    result += struct.pack('<I4s', len(binary), b'BIN\0') + binary
    output.mkdir(parents=True, exist_ok=True)
    (output / 'flexpendant.glb').write_bytes(result)
    record = {'model': 'ABB FlexPendant', 'partNumber': '3HAC031711-002', 'author': 'ABB',
              'source': source.name, 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
              'glbSha256': hashlib.sha256(result).hexdigest(), 'bytes': len(result),
              'triangles': sum(len(f[2]) // 3 for f in faces), 'sourceFaces': len(faces),
              'meshDraws': len(gltf['meshes']), 'originalEmbeddedTextures': len(gltf['images']),
              'units': 'metres', 'upAxis': 'Y', 'screenMaterial': 'CAD-material-7',
              'note': 'Original ABB CAD geometry and hardware texture retained; the application replaces the LCD texture only while teaching.'}
    (output / 'flexpendant-source.json').write_text(json.dumps(record, indent=2), encoding='utf-8')
    print(json.dumps(record))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    convert(args.source, args.output)
