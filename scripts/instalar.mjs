import { npm } from "./processos.mjs";
try {
  for (const modulo of ["contratos", "backend", "oraculo", "app"]) {
    console.log(`Instalando ${modulo}...`);
    await npm(modulo, ["ci"]);
  }
  console.log(
    "Dependencias Node instaladas. Para testes Python, prepare simulador/.venv conforme COMO-RODAR.",
  );
} catch (erro) {
  console.error(erro.message);
  process.exitCode = 1;
}
