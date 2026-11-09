// Runtime meshes are inspection handles, not claims about physical part names.
export function modelMeshInventory(meshes = []) {
  return meshes.map((mesh, index) => ({
    id: `mesh-${index + 1}`,
    name: String(mesh.name || '').trim() || `未命名网格 ${index + 1}`,
    vertexCount: Number(mesh.geometry?.attributes?.position?.count) || 0,
    triangleCount: Math.floor((Number(mesh.geometry?.index?.count) || Number(mesh.geometry?.attributes?.position?.count) || 0) / 3)
  }))
}
