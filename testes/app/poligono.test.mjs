/**
 * Geometria do poligono do talhao (HU09): importacao de GeoJSON para o cadastro.
 */
import assert from "node:assert/strict";
import { test } from "vitest";

import { anelDoGeoJson } from "../../app/src/geo/poligono.js";

const ANEL = [
  [-47.59, -21.45],
  [-47.57, -21.45],
  [-47.57, -21.47],
  [-47.59, -21.47],
];
const FECHADO = [...ANEL, ANEL[0]];

test("le o anel de um Polygon, de uma Feature e de uma FeatureCollection", () => {
  const poligono = { type: "Polygon", coordinates: [FECHADO] };
  const feature = { type: "Feature", properties: {}, geometry: poligono };
  const colecao = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", geometry: { type: "Point", coordinates: [0, 0] } },
      feature,
    ],
  };

  for (const g of [poligono, feature, colecao, JSON.stringify(colecao)]) {
    assert.deepEqual(anelDoGeoJson(g), ANEL);
  }
});

test("arquivo sem poligono e recusado com mensagem legivel", () => {
  assert.throws(
    () => anelDoGeoJson({ type: "Point", coordinates: [0, 0] }),
    /Polygon/,
  );
});
