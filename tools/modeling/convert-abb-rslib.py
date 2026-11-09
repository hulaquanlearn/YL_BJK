"""Convert the installed ABB IRB6700_150_320 revision 04 visualization to glTF.

Usage: python tools/modeling/convert-abb-rslib.py <ABB .rslib> <output directory>
Reads only the version-21 graphics streams; never modifies the RobotStudio library.
Exports the original CAD assembly coordinates in metres, with Y up. Collision
geometry and wire overlays are excluded. No kinematic simulation is implied.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import xml.etree.ElementTree as ET
import zipfile


class Reader:
    def __init__(self, data):
        self.data, self.offset = data, 0

    def read(self, fmt):
        values = struct.unpack_from('<' + fmt, self.data, self.offset)
        self.offset += struct.calcsize('<' + fmt)
        return values[0] if len(values) == 1 else values

    def array(self, fmt, dimension=1):
        count = self.read('I')
        assert count < 1_000_000, 'Unexpected array length'
        return [self.read(fmt * dimension) for _ in range(count)]


def graphics(data, include_uv=False):
    r, materials, faces = Reader(data), [], []
    assert r.read('I') in (20,21), 'Only graphics stream versions 20 and 21 are supported'
    for _ in range(r.read('I')):
        material = r.read('36f')
        materials.append(material[5:9])  # diffuse RGBA
    assert r.read('i') == -1
    for lod_index in range(r.read('I')):
        level, _bounds = r.read('i'), r.read('6f')
        for _ in range(r.read('I')):
            r.read('i')  # body identifier
            r.read('6f')
            for _ in range(r.read('I')):
                r.read('i')  # face identifier
                r.read('6f')
                material, _opacity, _flags = r.read('i'), r.read('f'), r.read('i')
                vertices, normals, _uv = r.array('f', 3), r.array('f', 3), r.array('f', 2)
                for _ in range(r.read('I')):
                    _primitive_id, kind, count = r.read('3i')
                    lengths = [r.read('I') for _ in range(count)]
                    indices = r.array('I')
                    assert sum(lengths) == len(indices)
                    assert not indices or max(indices) < len(vertices)
                    if lod_index == 0 and kind == 4:  # first display level, omit wire/collision data
                        assert len(vertices) == len(normals)
                        assert len(indices) % 3 == 0
                        face=(vertices, normals, indices, materials[material])
                        faces.append(face+(_uv,material) if include_uv else face)
                for _ in range(3):
                    r.array('f', 3)  # snap points
                r.read('2f')  # face display parameters (not vertex arrays)
    assert r.offset == len(data), 'Unconsumed graphics data'
    return faces


PARTS = [
    ('21', 'base'), ('23', 'axis1'), ('24', 'cable1'), ('26', 'axis2'),
    ('27', 'cable2'), ('29', 'axis3'), ('30', 'cable3'), ('31', 'axis4'),
    ('32', 'axis5'), ('33', 'axis6'), ('34', 'balance1'), ('35', 'balance2'),
]


def convert(source, output):
    source, output = Path(source), Path(output)
    with zipfile.ZipFile(source) as archive:
        ns = {'a': 'urn:abb-robotics-pim'}
        xml = ET.fromstring(archive.read('PIM.xml'))
        objects = {o.attrib['ID']: o for o in xml.find('a:Objects', ns)}
        assert objects['19'].find('a:ModelName', ns).attrib['Value'] == 'IRB6700_150_320'
        gltf = {'asset': {'version': '2.0', 'generator': 'ABB RobotStudio visualization conversion'},
                'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [],
                'materials': [], 'accessors': [], 'bufferViews': [], 'buffers': []}
        binary, colors, inventory = bytearray(), {}, []

        def accessor(values, fmt, dimension, component_type, target):
            while len(binary) % 4:
                binary.append(0)
            start = len(binary)
            for value in values:
                binary.extend(struct.pack('<' + fmt * dimension, *value) if dimension > 1 else struct.pack('<' + fmt, value))
            gltf['bufferViews'].append({'buffer': 0, 'byteOffset': start, 'byteLength': len(binary) - start, 'target': target})
            item = {'bufferView': len(gltf['bufferViews']) - 1, 'componentType': component_type,
                    'count': len(values), 'type': 'SCALAR' if dimension == 1 else 'VEC3'}
            if target == 34962:
                item['min'] = [min(v[i] for v in values) for i in range(dimension)]
                item['max'] = [max(v[i] for v in values) for i in range(dimension)]
            gltf['accessors'].append(item)
            return len(gltf['accessors']) - 1

        for definition, name in PARTS:
            stream = objects[definition].find('a:GfxData', ns).attrib['StreamID']
            faces = graphics(archive.read('Streams/' + stream + '.GfxDataStream.gfx'))
            primitives = []
            for vertices, normals, indices, rgba in faces:
                # ABB CAD coordinates use millimetres and Z up; glTF uses metres and Y up.
                vertices = [(x / 1000, z / 1000, -y / 1000) for x, y, z in vertices]
                normals = [(x, z, -y) for x, y, z in normals]
                assert all(math.isfinite(n) for v in vertices for n in v)
                key = tuple(round(c, 5) for c in rgba)
                if key not in colors:
                    colors[key] = len(gltf['materials'])
                    # Stored CAD colors are sRGB; glTF baseColorFactor is linear.
                    linear = [c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgba[:3]]
                    gltf['materials'].append({'pbrMetallicRoughness': {'baseColorFactor': linear + [rgba[3]],
                                              'metallicFactor': .15, 'roughnessFactor': .48}, 'doubleSided': True})
                primitives.append({'attributes': {'POSITION': accessor(vertices, 'f', 3, 5126, 34962),
                                                   'NORMAL': accessor(normals, 'f', 3, 5126, 34962)},
                                   'indices': accessor(indices, 'I', 1, 5125, 34963), 'material': colors[key]})
            gltf['meshes'].append({'name': name, 'primitives': primitives})
            gltf['nodes'].append({'name': name, 'mesh': len(gltf['meshes']) - 1})
            gltf['scenes'][0]['nodes'].append(len(gltf['nodes']) - 1)
            inventory.append({'id': name, 'triangles': sum(len(f[2]) // 3 for f in faces),
                              'sourceDefinition': definition, 'sourceStream': stream})
        gltf['buffers'] = [{'byteLength': len(binary)}]
        metadata = json.dumps(gltf, separators=(',', ':')).encode()
        metadata += b' ' * (-len(metadata) % 4)
        binary += b'\0' * (-len(binary) % 4)
        result = struct.pack('<III', 0x46546C67, 2, 28 + len(metadata) + len(binary))
        result += struct.pack('<I4s', len(metadata), b'JSON') + metadata
        result += struct.pack('<I4s', len(binary), b'BIN\0') + binary
        output.mkdir(parents=True, exist_ok=True)
        (output / 'irb6700-150-320.glb').write_bytes(result)
        provenance = {'model': 'ABB IRB 6700-150/3.20', 'axes': 6, 'payloadKg': 150, 'reachM': 3.2,
                      'source': source.name, 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                      'author': 'ABB', 'revision': '04', 'units': 'metres', 'upAxis': 'Y',
                      'pose': 'Original CAD assembly coordinates; no live robot or controller connection',
                      'conversion': 'Display level 1 triangles; original diffuse colors, normals and component coordinates retained. Wire overlays and collision hulls omitted.',
                      'specification': 'https://library.e.abb.com/public/3963df8a9b254840b2d73e0a173daddf/3HAC044265%20PS%20IRB%206700%20on%20IRC5-en.pdf',
                      'glbSha256': hashlib.sha256(result).hexdigest(), 'parts': inventory,
                      'frames': {'base': {'position': [0, 0, 0], 'x': [1, 0, 0], 'y': [0, 0, -1], 'z': [0, 1, 0]},
                                 'flange': {'parent': 'axis6', 'position': [2.1125, 2.26, 0],
                                            'x': [0, -1, 0], 'y': [0, 0, -1], 'z': [1, 0, 0]},
                                 'source': 'PIM.xml MechanismDef 19 Flanges wrist OffsetTransform; original CAD assembly pose'}}
        (output / 'source.json').write_text(json.dumps(provenance, indent=2), encoding='utf-8')
        print(json.dumps({'bytes': len(result), 'parts': len(inventory), 'triangles': sum(p['triangles'] for p in inventory)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source')
    parser.add_argument('output')
    args = parser.parse_args()
    convert(args.source, args.output)
