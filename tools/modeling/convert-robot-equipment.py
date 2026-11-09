"""Convert the user's two feeder heads and Gujing pot from local RobotStudio CAD.

Usage: python tools/modeling/convert-robot-equipment.py <Libraries directory> <output>
Component definitions are shared; CAD faces with the same material are batched per definition.
Instance transforms, CAD names and all triangles are retained.
The feeder heads omit their saved station placement, keeping the assembly origin.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import xml.etree.ElementTree as ET
import zipfile

spec = importlib.util.spec_from_file_location('robot_converter', Path(__file__).with_name('convert-abb-rslib.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
NS = {'a': 'urn:abb-robotics-pim'}
ASSETS = [
    ('tool-640', '640布料头古井七车间.rslib', False),
    ('tool-700', 'FJRB000910 古井七车间暂存皮带布料头（700宽度).rslib', False),
    ('gujing-pot', '古井甑锅.rslib', True),
]


def matrix(element):
    if element is None:
        return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    # PIM row vectors are serialized basis axes + translation. Convert basis
    # from ABB Z-up to glTF Y-up: C M C^-1, translations already in metres.
    abb = [[float(v.attrib['Value']) for v in row] for row in element]
    def cv(v):
        return [v[0], v[2], -v[1]]
    axes = [cv(abb[0]), cv(abb[2]), [-v for v in cv(abb[1])], cv(abb[3])]
    return [v for i, axis in enumerate(axes) for v in axis + [1 if i == 3 else 0]]


def convert(source, asset_id, keep_placement, output):
    z = zipfile.ZipFile(source)
    xml = ET.fromstring(z.read('PIM.xml'))
    objects = {o.attrib['ID']: o for o in xml.find('a:Objects', NS)}
    gltf = {'asset': {'version': '2.0', 'generator': 'RobotStudio CAD visualization conversion'},
            'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [],
            'materials': [], 'accessors': [], 'bufferViews': [], 'buffers': []}
    binary, colors, definitions, inventory, omitted, corrections = bytearray(), {}, {}, [], [], []
    belt_material = None

    def accessor(values, fmt, dimension, component, target):
        while len(binary) % 4:
            binary.append(0)
        start = len(binary)
        for value in values:
            binary.extend(struct.pack('<' + fmt * dimension, *value) if dimension > 1 else struct.pack('<' + fmt, value))
        gltf['bufferViews'].append({'buffer': 0, 'byteOffset': start, 'byteLength': len(binary) - start, 'target': target})
        item = {'bufferView': len(gltf['bufferViews']) - 1, 'componentType': component,
                'count': len(values), 'type': 'SCALAR' if dimension == 1 else 'VEC3'}
        if target == 34962:
            item['min'] = [min(v[i] for v in values) for i in range(dimension)]
            item['max'] = [max(v[i] for v in values) for i in range(dimension)]
        gltf['accessors'].append(item)
        return len(gltf['accessors']) - 1

    def mesh(definition):
        if definition in definitions:
            return definitions[definition]
        gfx = objects[definition].find('a:GfxData', NS)
        if gfx is None:
            return None
        primitives = []
        faces = module.graphics(z.read('Streams/' + gfx.attrib['StreamID'] + '.GfxDataStream.gfx'))
        batches = {}
        for vertices, normals, indices, rgba in faces:
            key = tuple(round(c, 5) for c in rgba)
            if key not in batches:
                batches[key] = [[], [], [], rgba]
            batch = batches[key]
            offset = len(batch[0])
            batch[0].extend((x / 1000, z / 1000, -y / 1000) for x, y, z in vertices)
            batch[1].extend((x, z, -y) for x, y, z in normals)
            batch[2].extend(i + offset for i in indices)
        for key, (vertices, normals, indices, rgba) in batches.items():
            if key not in colors:
                colors[key] = len(gltf['materials'])
                linear = [c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgba[:3]]
                gltf['materials'].append({'pbrMetallicRoughness': {'baseColorFactor': linear + [rgba[3]],
                                          'metallicFactor': .2, 'roughnessFactor': .5}, 'doubleSided': True})
            primitives.append({'attributes': {'POSITION': accessor(vertices, 'f', 3, 5126, 34962),
                                              'NORMAL': accessor(normals, 'f', 3, 5126, 34962)},
                               'indices': accessor(indices, 'I', 1, 5125, 34963), 'material': colors[key]})
        index = len(gltf['meshes'])
        gltf['meshes'].append({'name': 'definition-' + definition, 'primitives': primitives})
        definitions[definition] = index
        inventory.append({'definition': definition, 'triangles': sum(len(f[2]) // 3 for f in faces)})
        return index

    root_id = objects['1'].find('a:RootComponent', NS).attrib['ID']

    def node(instance, is_root=False):
        nonlocal belt_material
        obj = objects[instance]
        name = obj.find('a:Name', NS).attrib['Value']
        if any(marker in name for marker in ['体积模拟', '模拟物料重量']):
            omitted.append({'instance': instance, 'name': name, 'reason': 'CAD material/load reference solid; not a physical hopper cover'})
            return None
        index = len(gltf['nodes'])
        item = {'name': name, 'extras': {'sourceInstance': instance}}
        gltf['nodes'].append(item)
        if keep_placement or not is_root:
            item['matrix'] = matrix(obj.find('a:Transform', NS))
        if asset_id == 'tool-640' and '皮带U17' in name:
            original = item['matrix'][14]
            item['matrix'][14] = 0
            corrections.append({'instance': instance, 'name': name, 'change': 'Centre belt on hopper width axis', 'originalOffsetM': original})
        definition = obj.find('a:Definition', NS).attrib
        assert definition['DocID'] == '-1', 'External geometry references are not supported'
        geometry = mesh(definition['ID'])
        if geometry is not None:
            item['mesh'] = geometry
            if '皮带U17' in name:
                if belt_material is None:
                    belt_material = len(gltf['materials'])
                    gltf['materials'].append({'name': 'yellow-conveyor-belt', 'pbrMetallicRoughness': {
                        'baseColorFactor': [.784, .474, .038, 1], 'metallicFactor': 0, 'roughnessFactor': .88}, 'doubleSided': True})
                for primitive in gltf['meshes'][geometry]['primitives']:
                    primitive['material'] = belt_material
        children = obj.find('a:ChildInstances', NS)
        if children is not None and len(children):
            item['children'] = [n for child in children if (n := node(child.attrib['ID'])) is not None]
        return index

    gltf['scenes'][0]['nodes'] = [node(root_id, True)]
    gltf['buffers'] = [{'byteLength': len(binary)}]
    metadata = json.dumps(gltf, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    metadata += b' ' * (-len(metadata) % 4)
    binary += b'\0' * (-len(binary) % 4)
    result = struct.pack('<III', 0x46546C67, 2, 28 + len(metadata) + len(binary))
    result += struct.pack('<I4s', len(metadata), b'JSON') + metadata
    result += struct.pack('<I4s', len(binary), b'BIN\0') + binary
    (output / (asset_id + '.glb')).write_bytes(result)
    return {'id': asset_id, 'source': source.name, 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'glbSha256': hashlib.sha256(result).hexdigest(), 'bytes': len(result),
            'sourceRootTransform': matrix(objects[root_id].find('a:Transform', NS)),
            'keepRootPlacement': keep_placement, 'instances': len(gltf['nodes']), 'definitions': inventory,
            'omittedReferenceSolids': omitted,
            'displayCorrections': corrections,
            'drawCalls': sum(len(gltf['meshes'][n['mesh']]['primitives']) for n in gltf['nodes'] if 'mesh' in n)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('library_dir', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    assets = [convert(args.library_dir / file, id, keep, args.output) for id, file, keep in ASSETS]
    (args.output / 'equipment.json').write_text(json.dumps({'units': 'metres', 'upAxis': 'Y', 'assets': assets}, indent=2, ensure_ascii=False), encoding='utf-8')
    print(json.dumps([{'id': a['id'], 'bytes': a['bytes'], 'instances': a['instances']} for a in assets]))
