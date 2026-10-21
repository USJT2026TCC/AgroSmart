-- Esquema vigente: PostgreSQL/PostGIS, INMET A770 de 2020 a 30/09/2026.
CREATE EXTENSION IF NOT EXISTS postgis;

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', 'public', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

CREATE TABLE public.apolices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    endereco text NOT NULL,
    proposta_id uuid,
    talhao_id uuid,
    produtor_carteira text NOT NULL,
    seguradora_carteira text NOT NULL,
    talhao_bytes32 text NOT NULL,
    hash_termos text NOT NULL,
    valor_indenizacao_wei numeric(78,0) NOT NULL,
    tx_emissao text NOT NULL,
    bloco_emissao bigint NOT NULL,
    situacao smallint DEFAULT 0 NOT NULL,
    valor_pago_wei numeric(78,0) DEFAULT 0 NOT NULL,
    periodo_acionador integer,
    emitida_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT apolices_endereco_check CHECK ((endereco = lower(endereco))),
    CONSTRAINT apolices_situacao_check CHECK (((situacao >= 0) AND (situacao <= 4)))
);

CREATE TABLE public.auditoria (
    id bigint NOT NULL,
    instante timestamp with time zone DEFAULT now() NOT NULL,
    usuario_id uuid,
    perfil text,
    acao text NOT NULL,
    recurso text,
    tx_hash text,
    ip text,
    detalhes jsonb
);

CREATE SEQUENCE public.auditoria_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.auditoria_id_seq OWNED BY public.auditoria.id;

CREATE TABLE public.desafios_carteira (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid NOT NULL,
    mensagem text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    expira_em timestamp with time zone NOT NULL,
    usado_em timestamp with time zone
);

CREATE TABLE public.estado_indexador (
    chave text NOT NULL,
    ultimo_bloco bigint NOT NULL
);

CREATE TABLE public.eventos_cadeia (
    id bigint NOT NULL,
    contrato text NOT NULL,
    nome text NOT NULL,
    bloco bigint NOT NULL,
    indice_log integer NOT NULL,
    tx_hash text NOT NULL,
    argumentos jsonb NOT NULL,
    instante timestamp with time zone
);

CREATE SEQUENCE public.eventos_cadeia_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.eventos_cadeia_id_seq OWNED BY public.eventos_cadeia.id;

CREATE TABLE public.inmet_arquivos (
    estacao text NOT NULL,
    ano smallint NOT NULL,
    sha256_original text NOT NULL,
    sha256_diario text NOT NULL,
    procedencia jsonb NOT NULL,
    importado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inmet_anos_historicos CHECK (((estacao = 'A770'::text) AND ((ano >= 2020) AND (ano <= 2026))))
);

CREATE TABLE public.inmet_dias (
    estacao text NOT NULL,
    data date NOT NULL,
    chuva_mm numeric(9,1),
    horas_validas smallint NOT NULL,
    horas_ausentes smallint NOT NULL,
    horas_invalidas smallint NOT NULL,
    CONSTRAINT inmet_dias_check CHECK ((((horas_validas + horas_ausentes) + horas_invalidas) = 24)),
    CONSTRAINT inmet_dias_check1 CHECK (((horas_validas = 0) OR (chuva_mm IS NOT NULL))),
    CONSTRAINT inmet_dias_chuva_mm_check CHECK ((chuva_mm >= (0)::numeric)),
    CONSTRAINT inmet_dias_horas_ausentes_check CHECK (((horas_ausentes >= 0) AND (horas_ausentes <= 24))),
    CONSTRAINT inmet_dias_horas_invalidas_check CHECK (((horas_invalidas >= 0) AND (horas_invalidas <= 24))),
    CONSTRAINT inmet_dias_horas_validas_check CHECK (((horas_validas >= 0) AND (horas_validas <= 24))),
    CONSTRAINT inmet_recorte_historico CHECK (((estacao = 'A770'::text) AND ((data >= '2020-01-01'::date) AND (data <= '2026-09-30'::date))))
);

CREATE TABLE public.notificacoes (
    id bigint NOT NULL,
    usuario_id uuid NOT NULL,
    tipo text NOT NULL,
    titulo text NOT NULL,
    mensagem text NOT NULL,
    apolice_endereco text,
    tx_hash text,
    lida_em timestamp with time zone,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    email_enviado_em timestamp with time zone,
    email_tentativas smallint DEFAULT 0 NOT NULL
);

CREATE SEQUENCE public.notificacoes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.notificacoes_id_seq OWNED BY public.notificacoes.id;

CREATE TABLE public.produtos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    cultura text NOT NULL,
    modo_pagamento smallint NOT NULL,
    limiar_climatico integer DEFAULT 0 NOT NULL,
    limiar_climatico_integral integer DEFAULT 0 NOT NULL,
    valor_por_hectare_wei numeric(78,0) NOT NULL,
    taxa_premio_bps integer NOT NULL,
    vigencia_dias integer NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT produto_limiar_climatico CHECK ((limiar_climatico > 0)),
    CONSTRAINT produto_pagamento_integral CHECK (((NOT ativo) OR ((modo_pagamento = 0) AND (limiar_climatico_integral = 0)))),
    CONSTRAINT produto_teto_climatico CHECK (((modo_pagamento = 0) OR (limiar_climatico_integral > limiar_climatico))),
    CONSTRAINT produtos_limiar_climatico_check CHECK ((limiar_climatico >= 0)),
    CONSTRAINT produtos_limiar_climatico_integral_check CHECK ((limiar_climatico_integral >= 0)),
    CONSTRAINT produtos_modo_pagamento_check CHECK ((modo_pagamento = ANY (ARRAY[0, 1]))),
    CONSTRAINT produtos_taxa_premio_bps_check CHECK (((taxa_premio_bps >= 1) AND (taxa_premio_bps <= 10000))),
    CONSTRAINT produtos_valor_por_hectare_wei_check CHECK ((valor_por_hectare_wei > (0)::numeric)),
    CONSTRAINT produtos_vigencia_dias_check CHECK ((vigencia_dias > 0))
);

CREATE TABLE public.propostas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    produtor_id uuid NOT NULL,
    talhao_id uuid NOT NULL,
    produto_id uuid NOT NULL,
    area_segurada_ha numeric(14,4) NOT NULL,
    carteira_produtor text NOT NULL,
    valor_indenizacao_wei numeric(78,0) NOT NULL,
    premio_wei numeric(78,0) NOT NULL,
    termos jsonb NOT NULL,
    situacao text DEFAULT 'pendente'::text NOT NULL,
    descricao_dos_termos text,
    hash_termos text,
    vigencia_inicio timestamp with time zone,
    vigencia_fim timestamp with time zone,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizada_em timestamp with time zone DEFAULT now() NOT NULL,
    inicio_desejado date,
    CONSTRAINT propostas_area_segurada_ha_check CHECK ((area_segurada_ha > (0)::numeric)),
    CONSTRAINT propostas_carteira_produtor_check CHECK ((carteira_produtor = lower(carteira_produtor))),
    CONSTRAINT propostas_premio_wei_check CHECK ((premio_wei >= (0)::numeric)),
    CONSTRAINT propostas_situacao_check CHECK ((situacao = ANY (ARRAY['pendente'::text, 'preparada'::text, 'emitida'::text, 'recusada'::text]))),
    CONSTRAINT propostas_valor_indenizacao_wei_check CHECK ((valor_indenizacao_wei > (0)::numeric))
);

CREATE TABLE public.propriedades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    produtor_id uuid NOT NULL,
    nome text NOT NULL,
    municipio text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.publicacoes_oraculo (
    id bigint NOT NULL,
    apolice_endereco text NOT NULL,
    periodo integer NOT NULL,
    tx_hash text NOT NULL,
    indice_climatico integer NOT NULL,
    gas_usado numeric(78,0),
    gas_estimado numeric(78,0),
    custo_wei numeric(78,0),
    bloco bigint,
    enviado_em timestamp with time zone,
    confirmado_em timestamp with time zone,
    latencia_ms integer,
    acionou_pagamento boolean DEFAULT false NOT NULL,
    procedencia jsonb,
    oraculo text,
    confirmada_na_cadeia boolean DEFAULT false NOT NULL,
    registrada_em timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.publicacoes_oraculo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.publicacoes_oraculo_id_seq OWNED BY public.publicacoes_oraculo.id;

CREATE TABLE public.sessoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid NOT NULL,
    hash_token text NOT NULL,
    segundo_fator_pendente boolean DEFAULT false NOT NULL,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    expira_em timestamp with time zone NOT NULL,
    revogada_em timestamp with time zone,
    ip text,
    agente text
);

CREATE TABLE public.talhoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    propriedade_id uuid NOT NULL,
    identificador text NOT NULL,
    cultura text NOT NULL,
    geometria public.geometry(Polygon,4326) NOT NULL,
    area_ha numeric(14,4) NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT talhoes_geometria_check CHECK (public.st_isvalid(geometria)),
    CONSTRAINT talhoes_identificador_check CHECK (((char_length(identificador) >= 1) AND (char_length(identificador) <= 31)))
);

CREATE TABLE public.usuarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identificador text NOT NULL,
    nome text NOT NULL,
    perfil text NOT NULL,
    documento text,
    hash_senha text NOT NULL,
    totp_segredo_cifrado text,
    totp_ativo boolean DEFAULT false NOT NULL,
    carteira text,
    carteira_vinculada_em timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    email text,
    acesso_bloqueado boolean DEFAULT false NOT NULL,
    CONSTRAINT usuarios_carteira_check CHECK ((carteira = lower(carteira))),
    CONSTRAINT usuarios_email_check CHECK (((email IS NULL) OR (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text))),
    CONSTRAINT usuarios_perfil_check CHECK ((perfil = ANY (ARRAY['produtor'::text, 'seguradora'::text])))
);

ALTER TABLE ONLY public.auditoria ALTER COLUMN id SET DEFAULT nextval('public.auditoria_id_seq'::regclass);

ALTER TABLE ONLY public.eventos_cadeia ALTER COLUMN id SET DEFAULT nextval('public.eventos_cadeia_id_seq'::regclass);

ALTER TABLE ONLY public.notificacoes ALTER COLUMN id SET DEFAULT nextval('public.notificacoes_id_seq'::regclass);

ALTER TABLE ONLY public.publicacoes_oraculo ALTER COLUMN id SET DEFAULT nextval('public.publicacoes_oraculo_id_seq'::regclass);

ALTER TABLE ONLY public.apolices
    ADD CONSTRAINT apolices_endereco_key UNIQUE (endereco);

ALTER TABLE ONLY public.apolices
    ADD CONSTRAINT apolices_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.apolices
    ADD CONSTRAINT apolices_proposta_id_key UNIQUE (proposta_id);

ALTER TABLE ONLY public.auditoria
    ADD CONSTRAINT auditoria_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.desafios_carteira
    ADD CONSTRAINT desafios_carteira_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.estado_indexador
    ADD CONSTRAINT estado_indexador_pkey PRIMARY KEY (chave);

ALTER TABLE ONLY public.eventos_cadeia
    ADD CONSTRAINT eventos_cadeia_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.eventos_cadeia
    ADD CONSTRAINT eventos_cadeia_tx_hash_indice_log_key UNIQUE (tx_hash, indice_log);

ALTER TABLE ONLY public.inmet_arquivos
    ADD CONSTRAINT inmet_arquivos_pkey PRIMARY KEY (estacao, ano);

ALTER TABLE ONLY public.inmet_dias
    ADD CONSTRAINT inmet_dias_pkey PRIMARY KEY (estacao, data);

ALTER TABLE ONLY public.notificacoes
    ADD CONSTRAINT notificacoes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.notificacoes
    ADD CONSTRAINT notificacoes_usuario_id_tipo_tx_hash_key UNIQUE (usuario_id, tipo, tx_hash);

ALTER TABLE ONLY public.produtos
    ADD CONSTRAINT produtos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.propostas
    ADD CONSTRAINT propostas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.propriedades
    ADD CONSTRAINT propriedades_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.publicacoes_oraculo
    ADD CONSTRAINT publicacoes_oraculo_apolice_endereco_periodo_key UNIQUE (apolice_endereco, periodo);

ALTER TABLE ONLY public.publicacoes_oraculo
    ADD CONSTRAINT publicacoes_oraculo_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.publicacoes_oraculo
    ADD CONSTRAINT publicacoes_oraculo_tx_hash_key UNIQUE (tx_hash);

ALTER TABLE ONLY public.sessoes
    ADD CONSTRAINT sessoes_hash_token_key UNIQUE (hash_token);

ALTER TABLE ONLY public.sessoes
    ADD CONSTRAINT sessoes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.talhoes
    ADD CONSTRAINT talhoes_identificador_key UNIQUE (identificador);

ALTER TABLE ONLY public.talhoes
    ADD CONSTRAINT talhoes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_carteira_key UNIQUE (carteira);

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_identificador_key UNIQUE (identificador);

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);

CREATE INDEX apolices_produtor_idx ON public.apolices USING btree (produtor_carteira);

CREATE INDEX auditoria_instante_idx ON public.auditoria USING btree (instante);

CREATE INDEX auditoria_tx_idx ON public.auditoria USING btree (tx_hash);

CREATE INDEX eventos_contrato_idx ON public.eventos_cadeia USING btree (contrato, bloco);

CREATE INDEX notificacoes_usuario_idx ON public.notificacoes USING btree (usuario_id, lida_em);

CREATE INDEX propostas_produtor_idx ON public.propostas USING btree (produtor_id);

CREATE INDEX propostas_situacao_idx ON public.propostas USING btree (situacao);

CREATE INDEX sessoes_usuario_idx ON public.sessoes USING btree (usuario_id);

CREATE INDEX talhoes_geometria_idx ON public.talhoes USING gist (geometria);

ALTER TABLE ONLY public.apolices
    ADD CONSTRAINT apolices_proposta_id_fkey FOREIGN KEY (proposta_id) REFERENCES public.propostas(id);

ALTER TABLE ONLY public.apolices
    ADD CONSTRAINT apolices_talhao_id_fkey FOREIGN KEY (talhao_id) REFERENCES public.talhoes(id);

ALTER TABLE ONLY public.desafios_carteira
    ADD CONSTRAINT desafios_carteira_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.notificacoes
    ADD CONSTRAINT notificacoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.propostas
    ADD CONSTRAINT propostas_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES public.produtos(id);

ALTER TABLE ONLY public.propostas
    ADD CONSTRAINT propostas_produtor_id_fkey FOREIGN KEY (produtor_id) REFERENCES public.usuarios(id);

ALTER TABLE ONLY public.propostas
    ADD CONSTRAINT propostas_talhao_id_fkey FOREIGN KEY (talhao_id) REFERENCES public.talhoes(id);

ALTER TABLE ONLY public.propriedades
    ADD CONSTRAINT propriedades_produtor_id_fkey FOREIGN KEY (produtor_id) REFERENCES public.usuarios(id);

ALTER TABLE ONLY public.sessoes
    ADD CONSTRAINT sessoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.talhoes
    ADD CONSTRAINT talhoes_propriedade_id_fkey FOREIGN KEY (propriedade_id) REFERENCES public.propriedades(id);

