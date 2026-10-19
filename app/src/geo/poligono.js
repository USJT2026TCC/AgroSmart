/**
 * Geometria do poligono do talhao, sem biblioteca de mapas.
 *
 * A conferencia de autointersecao e a medida de area ficam com o servidor, que
 * usa o PostGIS sobre o elipsoide (RF14). Aqui so entra o que a tela de cadastro
 * precisa para desenhar e importar o poligono (HU09).
 */

/**
 * Extrai o anel externo de um GeoJSON (Polygon, Feature ou FeatureCollection com
 * um poligono). Devolve pares [lon, lat] sem o ponto de fechamento repetido.
 */
export function anelDoGeoJson(texto) {
  const g = typeof texto === "string" ? JSON.parse(texto) : texto;

  const geometria =
    g.type === "FeatureCollection"
      ? g.features?.find((f) => f.geometry?.type === "Polygon")?.geometry
      : g.type === "Feature"
        ? g.geometry
        : g;

  if (geometria?.type !== "Polygon" || !Array.isArray(geometria.coordinates?.[0])) {
    throw new Error(
      "O arquivo precisa conter um Polygon (direto, em Feature ou em FeatureCollection).",
    );
  }

  const anel = geometria.coordinates[0].map(([lon, lat]) => [Number(lon), Number(lat)]);
  const [primeiro, ultimo] = [anel[0], anel.at(-1)];
  if (anel.length > 1 && primeiro[0] === ultimo[0] && primeiro[1] === ultimo[1]) anel.pop();

  return anel;
}
