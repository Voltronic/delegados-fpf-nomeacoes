import { normalizarNome } from '../fpf/html'

/**
 * Recintos com localização confirmada por quem conhece o terreno.
 *
 * São os recintos das competições nacionais, que se repetem época após época.
 * Sem esta lista, cada base de dados nova teria de os localizar outra vez pelo
 * OpenStreetMap: demora minutos, falha em vários (uns não existem no mapa,
 * outros têm homónimos que ganham — há um "Complexo Desportivo Laranjeiras" em
 * Lisboa e outro em Ponta Delgada, e o "Estádio Dois Irmãos" é em Lagoa e não
 * em Faro) e obrigaria o coordenador a confirmar tudo de novo, um a um.
 *
 * A lista saiu da base de dados do coordenador depois de ele ter confirmado os
 * 90 recintos. Entram como confirmados, porque a origem é humana e não uma
 * heurística.
 *
 * Isto só acrescenta: um recinto que já exista na base de dados nunca é
 * alterado a partir daqui (ver `semearRecintos` em `src/main/db/semente.ts`).
 */
export interface RecintoConhecido {
  /** Nome tal como vem da FPF; a comparação é feita já normalizada. */
  nome: string
  lat: number
  lng: number
  descricao: string
}

export const RECINTOS_CONHECIDOS: RecintoConhecido[] = [
  { nome: 'Amco Arena', lat: 41.565558, lng: -8.4301487, descricao: 'Cidade Desportiva SC Braga, EN 101, Braga (São Vicente), Real, Dume e Semelhe, Braga, 4700-084, Portugal' },
  { nome: 'Benfica Campus - Campo Nº1', lat: 38.6392999, lng: -9.0910377, descricao: 'Benfica Campus — Campo n.º 1, Seixal' },
  { nome: 'Campo Chã Das Padeiras', lat: 39.2295837, lng: -8.6927034, descricao: 'Campo de Jogos Chã das Padeiras, Estrada do Poço do Reto, Marvila, Cidade de Santarém, Santarém, 2000-185' },
  { nome: 'Campo Cruzeiro', lat: 41.7676223, lng: -8.5763941, descricao: '' },
  { nome: 'Campo Da Mata', lat: 39.4034078, lng: -9.126419, descricao: 'Campo da Mata, Caldas da Rainha' },
  { nome: 'Campo De Jogos António Trigueiros De Aragão', lat: 39.9199356, lng: -7.4485309, descricao: '' },
  { nome: 'Campo Estrela', lat: 38.5622946, lng: -7.9179118, descricao: 'Campo Estrela, Ciclovia N380, Vila Lusitano, Horta das Figueiras, Malagueira e Horta das Figueiras, Évora' },
  { nome: 'Campo Gandarada', lat: 40.4012303, lng: -8.2299282, descricao: 'Mortágua Futebol Clube, Rua Dom Sancho I, Gândara, Mortágua, Vale de Remígio, Cortegaça e Almaça, Mortágua' },
  { nome: 'Campo Manuel Marques', lat: 39.0948686, lng: -9.2566413, descricao: 'Sport Clube União Torreense, Rua Cândido dos Reis, Santa Maria, São Pedro e Matacães, Torres Vedras' },
  { nome: 'Campo Municipal Dos Prazeres', lat: 32.7517953, lng: -17.2039904, descricao: 'Campo Municipal dos Prazeres, Impasse do Campo, Picos, Prazeres, Calheta, Madeira, 9370-656, Portugal' },
  { nome: 'Campo Municipal Ponte Da Barca', lat: 41.8048387, lng: -8.4186834, descricao: 'Ponte da Barca, Viana do Castelo, Portugal' },
  { nome: 'Campo N.º 1 Centro De Treinos Estádio Cidade De Barcelos', lat: 41.552688, lng: -8.6233325, descricao: 'Centro de Treinos Adelino Ribeiro Novo, Barcelos' },
  { nome: 'Campo N.º 1 Cidade Desportiva Sc Braga', lat: 41.5667517, lng: -8.4262409, descricao: 'Cidade Desportiva SC Braga, Avenida Olímpica, Real, Dume e Semelhe, Braga, 4700-441, Portugal' },
  { nome: 'Campo Nº 1 Real Sport Clube', lat: 38.7520455, lng: -9.2696784, descricao: 'Real sport Clube, Rua Bernardo Pereira, Queluz, Sintra, Lisboa, 2745-191, Portugal' },
  { nome: 'Campo Nº. 2 Compl. Desp. Prof.Jose Gameiro Sousa Gomes', lat: 39.1786874, lng: -8.5781276, descricao: 'Complexo Desportivo Prof. José Sousa Gomes, Fazendas de Almeirim' },
  { nome: 'Campo Nº5 Complexo Desportivo Dr. António Pimenta Machado', lat: 41.4492053, lng: -8.2779304, descricao: 'Vitória Sport Clube, Praça 26 de Maio, Oliveira, São Paio e São Sebastião, Guimarães, Braga, 4810-525' },
  { nome: 'Campo Padre José Tavares', lat: 40.9172753, lng: -7.9392631, descricao: 'Campo Futebol Padre José Tavares, Trilho da Pombeira, Lamelas de Cá, Castro Daire, Viseu, 3600-275, Portugal' },
  { nome: 'Complexo Desportivo C.F. Fão', lat: 41.5030937, lng: -8.7696533, descricao: 'Complexo Desportivo do Clube de Futebol de Fão, Esposende' },
  { nome: 'Complexo Desportivo Castro Daire', lat: 40.901935, lng: -7.9283727, descricao: 'Complexo Desportivo Municipal de Castro Daire, Avenida Maria Alcina Fadista, Braços de Cá, Castro Daire' },
  { nome: 'Complexo Desportivo Elias Pereira - Campo Nº 1', lat: 38.7898904, lng: -9.1025338, descricao: 'Complexo Desportivo Elias Pereira, Viaduto da Matinha, Parque das Nações, Sacavém e Prior Velho, Loures' },
  { nome: 'Complexo Desportivo Laranjeiras', lat: 37.7470132, lng: -25.6510481, descricao: 'Complexo Desportivo das Laranjeiras, Ponta Delgada' },
  { nome: 'Complexo Desportivo Vila Pouca De Aguiar', lat: 41.5033819, lng: -7.6401919, descricao: 'Complexo Desportivo, Vila Pouca de Aguiar, Vila Real, Portugal' },
  { nome: 'Complexo Municipal De Atletismo Setubal', lat: 38.5334991, lng: -8.8293047, descricao: 'Complexo Municipal de Atletismo de Setúbal, Estrada do Vale da Rosa, Setúbal (São Sebastião), Sado' },
  { nome: 'Est. Parque Desportivo Municipal Mafra', lat: 38.9407026, lng: -9.3417803, descricao: 'Mafra, Lisboa, Portugal' },
  { nome: 'Estadio Algarve', lat: 37.088385, lng: -7.9755825, descricao: 'Louletano Desportos Clube, Rua Sebastião Cordeiro, Parrela, Loulé (São Clemente), Loulé, Faro, 8100-513' },
  { nome: 'Estadio Dois Irmaos', lat: 37.1397813, lng: -8.5565071, descricao: 'Estádio Municipal dos Dois Irmãos, Lagoa' },
  { nome: 'Estadio Municipal 25 Abril', lat: 41.211805, lng: -8.277222, descricao: 'Estádio Municipal 25 de Abril, Rua Abílio Miranda, Milhundos, Penafiel, Porto, 4560-511, Portugal' },
  { nome: 'Estadio Municipal Vila Meã', lat: 41.2525992, lng: -8.1709583, descricao: 'Estádio Municipal de Vila Meã, Avenida do Estádio, Paço, Vila Meã, Amarante, Porto, 4605-362, Portugal' },
  { nome: 'Estadio Nacional', lat: 38.7087907, lng: -9.2605909, descricao: 'Estádio Nacional, Avenida Pierre de Coubertin, Algés, Linda-a-Velha e Cruz Quebrada-Dafundo, Oeiras' },
  { nome: 'Estadio Nuno Alvares Pereira', lat: 39.8069198, lng: -8.1932005, descricao: 'Grupo Desportivo Vitória de Sernache, Rua da Zona Industrial, Zona Industrial de Cernache do Bonjardim' },
  { nome: 'Estádio Abel Alves Figueiredo', lat: 41.3436684, lng: -8.4821046, descricao: 'Estádio Abel Alves de Figueiredo, Rua de Dona Maria do Carmo Azevedo, Vilalva, Santo Tirso' },
  { nome: 'Estádio António De Almeida Correia Foni', lat: 38.7552044, lng: -8.9558284, descricao: 'Alameda Grupo Desportivo Alcochetense, Várzea, Alcochete, Setúbal, 2890-110, Portugal' },
  { nome: 'Estádio Aurélio Pereira', lat: 38.7295717, lng: -8.8488811, descricao: 'Estádio Aurélio Pereira, EN 4, Alcochete, Setúbal, Portugal' },
  { nome: 'Estádio Bolhão', lat: 40.9962975, lng: -8.5326322, descricao: 'Estádio do Bolhão, Travessa de Penoucos, Fiães, Santa Maria da Feira, Aveiro, 4505-374, Portugal' },
  { nome: 'Estádio Capital Do Móvel', lat: 41.2714775, lng: -8.3853824, descricao: 'Estádio Capital do Móvel, Rua Laura Ferreira Jorge, Ponte Real, Paços de Ferreira, Porto, 4595-158, Portugal' },
  { nome: 'Estádio Carlos Osório', lat: 40.8418112, lng: -8.4704214, descricao: 'Estádio Doutor Carlos Osório, Rua Doutor Ilídio de Freitas, Lações de Baixo, Oliveira de Azeméis' },
  { nome: 'Estádio Cd Trofense', lat: 41.3331182, lng: -8.5644689, descricao: 'Estádio do Clube Desportivo Trofense, Rua de Américo Campos, Trofa Velha, Lagoa' },
  { nome: 'Estádio Da Camacha', lat: 32.6720386, lng: -16.8525194, descricao: 'Complexo Desportivo da Associação Desportiva da Camacha, Rua dos Vimieiros' },
  { nome: 'Estádio Da Imaculada Conceição', lat: 32.6705044, lng: -16.9362463, descricao: 'Estádio da Imaculada Conceição, Vereda do Campo do Marítimo, Salão, Madalena, Santo António, Funchal' },
  { nome: 'Estádio Da Medideira', lat: 38.633085, lng: -9.1166261, descricao: 'Estádio da Medideira, Rua Quinta da Medideira, Medideira, Amora, Seixal, Setúbal, 2845-466, Portugal' },
  { nome: 'Estádio Das Seixas', lat: 38.9342364, lng: -9.2564378, descricao: 'Estádio das Seixas, Rua Doutor Mário Madeira, Malveira e São Miguel de Alcainça, Mafra, Lisboa, 2665-003' },
  { nome: 'Estádio Dr Jorge Sampaio', lat: 41.0671433, lng: -8.5448374, descricao: 'Valadares Gaia Futebol Clube, Travessa da Carreira Funda, Valadares, Vila Nova de Gaia, Porto, 4405-568' },
  { nome: 'Estádio Dr. José Matos', lat: 41.6968086, lng: -8.8385593, descricao: 'Estádio Doutor José de Matos, Rua de São José, Viana do Castelo (Santa Maria Maior e Monserrate) e Meadela' },
  { nome: 'Estádio José Arcanjo', lat: 37.0292357, lng: -7.8485194, descricao: 'Estádio José Arcanjo, Rua Luciano Jorge Fernandes, Olhão, Faro, 8700-491, Portugal' },
  { nome: 'Estádio Leça Futebol Clube', lat: 41.2033443, lng: -8.6893465, descricao: 'Estádio do Leça Futebol Clube, Autoestrada do Litoral Norte, Gonçalves, Leça da Palmeira, Custóias' },
  { nome: 'Estádio Luís Filipe Menezes', lat: 41.0659139, lng: -8.5169532, descricao: 'Estádio Luís Filipe Menezes, Travessa do Alto da Estrada, Olival, Vila Nova de Gaia, Porto, 4415-727, Portugal' },
  { nome: 'Estádio Marques Silva', lat: 40.8650067, lng: -8.6265399, descricao: 'Ovarense Campo de Futebol e Pavilhão da Associação Desportiva Ovarense, Rua Associação Desportiva Ovarense' },
  { nome: 'Estádio Municipal Albufeira', lat: 37.0986247, lng: -8.2402244, descricao: 'Campo de Treinos do Imortal DC, Rua José Carlos Ary dos Santos, Quinta da Palmeira' },
  { nome: 'Estádio Municipal Alpendorada', lat: 41.0883378, lng: -8.2515993, descricao: 'Estádio municipal de Alpendorada, Avenida Doutor Francisco de Sá Carneiro, Matos, Alpendurada, Alpendorada' },
  { nome: 'Estádio Municipal Aveiro - Dr Mario Duarte', lat: 40.6478091, lng: -8.5936953, descricao: 'Sport Clube Beira-Mar, Rua da Mauricia, Ucha, Aradas, Aveiro, 3810-433, Portugal' },
  { nome: 'Estádio Municipal Bragança', lat: 41.8034343, lng: -6.7703088, descricao: 'Estádio Municipal de Santa Luzia, Rue Bernardo Fernandes Monteiro, Miranda do Douro, Distrito de Bragança' },
  { nome: 'Estádio Municipal Domingos Carrilho Patalino', lat: 38.8771726, lng: -7.1576487, descricao: '' },
  { nome: 'Estádio Municipal Dr Machado Matos', lat: 41.3559387, lng: -8.1907976, descricao: 'Estádio Doutor Machado de Matos, : Rua Júlio Martins – Pav C – Edificio Magistral (trás), Casais Novas' },
  { nome: 'Estádio Municipal Fafe', lat: 41.4471519, lng: -8.1690937, descricao: 'Estádio Municipal de Fafe, Rua Professor Manuel José da Costa, Bairro da Cumieira, Pardelhas, Fafe, Braga' },
  { nome: 'Estádio Municipal Fornos De Algodres', lat: 40.6229467, lng: -7.5467411, descricao: 'Estadio Municipal, EM 587, Fornos de Algodres, Guarda, 6370-147, Portugal' },
  { nome: 'Estádio Municipal Guarda', lat: 40.5364258, lng: -7.2776913, descricao: 'Estadio Municipal, EM 587, Fornos de Algodres, Guarda, 6370-147, Portugal' },
  { nome: 'Estádio Municipal José Bento Pessoa', lat: 40.1627383, lng: -8.8598115, descricao: 'Estádio Municipal José Bento Pessoa, Rua do Ginásio Clube Figueirense, Tavarede, Figueira da Foz, Coimbra' },
  { nome: 'Estádio Municipal José Santos Pinto', lat: 40.2832475, lng: -7.5121215, descricao: 'Estádio Municipal José dos Santos Pinto, Rua Pinhal do Gaiteiro, Biquinha, Covilhã e Canhoso, Covilhã' },
  { nome: 'Estádio Municipal Laranjeiras', lat: 41.2025678, lng: -8.3330238, descricao: 'Sede so USC de Baltar, Rua Professor Meireles da Cunha, Giesteira, Vila Nova, Baltar, Paredes, Porto' },
  { nome: 'Estádio Municipal Lousada', lat: 41.2845163, lng: -8.2925824, descricao: 'Estádio Comendador Joaquim de Almeida Freitas, Rua da Luz, Ponte, Moreira de Cónegos, Guimarães, Braga' },
  { nome: 'Estádio Municipal Marco De Canaveses', lat: 41.1925346, lng: -8.1453022, descricao: 'Estádio Municipal do Marco de Canaveses, Rua Doutor Arlindo Gonçalves Soares, Fornos, Marco' },
  { nome: 'Estádio Municipal Pombal', lat: 39.9103038, lng: -8.6314901, descricao: 'Estádio Municipal de Pombal, Rua de Leiria, Flandes, Pombal, Leiria, 3100-545, Portugal' },
  { nome: 'Estádio Municipal Prof Cerveira Pinto', lat: 41.0743369, lng: -8.1005566, descricao: 'Cinfães, Viseu, Portugal' },
  { nome: 'Estádio Municipal Tábua', lat: 40.3693983, lng: -8.023016, descricao: 'Estádio Municipal de Tábua, Estrada de São Fagundo, Torre, Tábua, Coimbra, 3420-328, Portugal' },
  { nome: 'Estádio Municipal V N Famalicão', lat: 41.4014067, lng: -8.522406, descricao: 'Vila Nova de Famalicão, Braga, Portugal' },
  { nome: 'Estádio Papa Francisco', lat: 39.6034842, lng: -8.6632709, descricao: 'Estádio João Paulo II, Rua Padre António Martins Pereira, Lomba de Égua, Aljustrel, Fátima, Ourém' },
  { nome: 'Estádio Sporting Clube São João Vêr', lat: 40.9585458, lng: -8.5565912, descricao: 'Estádio do Sporting Clube de São João de Ver, Travessa do Estádio, São Bento, São João de Ver' },
  { nome: 'Estádio Tapadinha - Campo 1', lat: 38.7096901, lng: -9.1808232, descricao: 'Tapadinha, Tolosa, Nisa, Portalegre, 6050-541, Portugal' },
  { nome: 'Estádio Varzim Sport Clube', lat: 41.3879942, lng: -8.7732612, descricao: 'Loja Oficial Varzim Sport Club, Rua do Varzim Sport Clube, Bairro Piscatório, Póvoa de Varzim, Porto' },
  { nome: 'Parque Desportivo De Ança', lat: 40.269662, lng: -8.5249722, descricao: 'Parque Desportivo, Rua de Santa Maria, Ançã, Cantanhede, Coimbra, 3060-040, Portugal' },
  { nome: 'Parque Desportivo De Serpa - Campo Manuel Baião', lat: 37.9389941, lng: -7.5974209, descricao: 'Serpa, Beja, Portugal' },
  { nome: 'Parque Jogos Do S.U. Sintrense', lat: 38.7989557, lng: -9.376928, descricao: 'Parque de Jogos do SU Sintrense, Rua Casal da Mina, Bairro da Fonte Longa, Portela de Sintra, Sintra' },
  { nome: 'Pav Engº Santos E Castro (Tapadinha)', lat: 38.7098776, lng: -9.1817929, descricao: 'Rua Clube Atlético e Recreativo do Caramão, Caramão da Ajuda, Ajuda, Lisboa, 1400-058, Portugal' },
  { nome: 'Pavilhao Do Leões Porto Salvo', lat: 38.7229328, lng: -9.304048, descricao: 'Pavilhão Leões Porto Salvo, Oeiras' },
  { nome: 'Pavilhao Gimnodesportivo De Portimão', lat: 37.1340021, lng: -8.5408549, descricao: 'Pavilhão Gimnodesportivo de Portimão, Avenida Miguel Bombarda, Três Bicos, Praia da Rocha, Portimão, Faro' },
  { nome: 'Pavilhao Municipal Fundão', lat: 40.1409762, lng: -7.5027873, descricao: 'Pavilhão Municipal do Fundão, Rua Município do Tarrafal, União do Grande Fundão, Fundão, Castelo Branco' },
  { nome: 'Pavilhão António Ferreira', lat: 38.756717, lng: -9.2114116, descricao: 'Pavilhao António Ferreira, Rua do Parque, Venda Nova, Falagueira-Venda Nova, Brandoa, Amadora, Lisboa' },
  { nome: 'Pavilhão Desportos Vila Do Conde', lat: 41.3612316, lng: -8.739626, descricao: 'Rio Ave Futebol Clube, Rua Dona Maria Paes Ribeiro, Lapa, Alto da Pega, Vila do Conde, Porto, 4480-757' },
  { nome: 'Pavilhão Do Grupo Nun\'álvares', lat: 41.4537919, lng: -8.1655133, descricao: 'Grupo Cultural e Recreativo Nun\'Álvares, Guimarães' },
  { nome: 'Pavilhão Escola Eb 2,3 Mindelo', lat: 41.3096118, lng: -8.7204626, descricao: 'Escola Básica de Mindelo, Rua da Fonte, Mindelo, Vila do Conde, Porto, 4485-956, Portugal' },
  { nome: 'Pavilhão Escola Secundária Romeu Correia', lat: 38.6510685, lng: -9.1623713, descricao: 'Escola Secundária Romeu Correia, Rua Virgínia Moura, Alembrança, Laranjeiro e Feijó, Almada, Setúbal' },
  { nome: 'Pavilhão Escola Secundária São Gonçalo', lat: 39.0804666, lng: -9.2626729, descricao: 'Sport Clube União Torreense, Rua Cândido dos Reis, Santa Maria, São Pedro e Matacães, Torres Vedras' },
  { nome: 'Pavilhão Fidelidade', lat: 38.7512812, lng: -9.1835078, descricao: 'Pavilhão 1, Avenida Lusíada, São Domingos de Benfica, Lisboa, 1500-065, Portugal' },
  { nome: 'Pavilhão Gimnodesportivo De Ponte De Sôr', lat: 39.2526873, lng: -8.0110581, descricao: 'Pavilhão Gimnodesportivo de Ponte de Sor, 6A, Rua João Pedro de Andrade, Barroqueira, Ponte de Sor' },
  { nome: 'Pavilhão João Rocha', lat: 38.763431, lng: -9.158429, descricao: 'Pavilhão João Rocha, Rua Francisco Stromp, Quinta do Lambert, Lumiar, Lisboa, 1750-147, Portugal' },
  { nome: 'Pavilhão Municipal Da Maia', lat: 41.2337161, lng: -8.617302, descricao: 'Pavilhão Municipal de Gueifães II, Rua da Ponte do Vasco, Gueifães, Cidade da Maia, Maia, Porto, 4470-447' },
  { nome: 'Pavilhão Municipal Ferreira Do Zêzere', lat: 39.6958999, lng: -8.2876176, descricao: 'Ferreira do Zêzere, Santarém, Portugal' },
  { nome: 'Pavilhão Municipal Jose Natário', lat: 41.6933459, lng: -8.8457862, descricao: 'Angra (Santa Luzia), Angra do Heroísmo, Açores, Portugal' },
  { nome: 'Pavilhão Municipal Lameiras', lat: 41.408857, lng: -8.5150175, descricao: 'Futebol Clube Famalicão, Rua António Ferreira Magalhães, Bargos, Calendário' },
  { nome: 'Pavilhão Municipal Napoleão Guerra', lat: 41.0041314, lng: -8.6044715, descricao: 'Novasemente Grupo Desportivo, Rua da Mina, Anta, Espinho, Aveiro, 4500-075, Portugal' }
]

const POR_NOME = new Map(RECINTOS_CONHECIDOS.map((r) => [normalizarNome(r.nome), r]))

export function recintoConhecido(nome: string): RecintoConhecido | undefined {
  return POR_NOME.get(normalizarNome(nome))
}
