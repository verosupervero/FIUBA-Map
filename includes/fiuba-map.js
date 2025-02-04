function graphFromCSV(data) {
    let container = document.getElementById('grafo');
    [NODOS, ARISTAS, GRUPOS, NODOS_CRED] = csvToNodesAndEdges(data)
    network = createNetwork(container, NODOS, ARISTAS)

    // Crea un cluster para las materias electivas y uno por cada orientacion
    // El cluster no se muestra (hidden: true)
    // Al clickear en los botones del menu, se abre el cluster, mostrando los nodos
    GRUPOS.forEach(grupo => {
        if (grupo.includes('Electivas') || grupo.includes('Orientación')) {
            let cluster = createClusterFromCategoria(grupo)
            network.cluster(cluster)
            if (grupo.includes('Orientación')) {
                let [_,orientacion] = grupo.split(':')
                $("#orientaciones").append("<a class='toggle' id='toggle-"+grupo+"'>"+orientacion+"</a>")
            }
        }
    })
    bindings()
    aprobar('CBC')
}

function csvToNodesAndEdges(data){
    let nodes = []
    let edges = []
    let grupos = []
    let nodosCred = []

    let allRows = data.split(/\r?\n|\r/);
    for (let singleRow = 1; singleRow < allRows.length-1; singleRow++) {
        let rowCells = allRows[singleRow].split(',');        
        let node = parseNode(rowCells)
        let correlativas = rowCells[3].split('-')
        for(let i=0; i<correlativas.length; i++){
            if(correlativas[i].includes('CRED')){
                // Un nodo CRED es aquel que requiere n creditos para aprobar (ej: legislatura necesita 140 creditos)
                let [_, c] = correlativas[i].split('CRED')
                node.requiere = c
                nodosCred.push(node)
                continue
            }
            let edge = {from:correlativas[i],to:rowCells[0]}
            
            // Las aristas entre CBC y los nodos CRED sirven para que el layout quede bien
            // Pero no deben ser mostradas
            if (correlativas[i] == 'CBC' && node.requiere) {edge.hidden = true}
            edges.push(edge)
        }

        nodes.push(node)

        if (!grupos.includes(rowCells[4])) {grupos.push(rowCells[4])}
    }
    return [new vis.DataSet(nodes), new vis.DataSet(edges), grupos, nodosCred]
}

function createNetwork(container, nodes, edges){
    let data = { nodes: nodes, edges: edges };
    let options = {
        nodes:{ shape:'box' },
        layout: { hierarchical: { enabled: true, direction: 'LR', levelSeparation: 150 } },
        edges:{ arrows: { to: {enabled: true, scaleFactor:0.7, type:'arrow'} } },
        groups: { 
            Aprobadas: { color: '#7BE141' },
            Habilitadas: { color: '#ffa500' },
            'Materias Electivas': { color: '#FA8072' },
            'Materias Obligatorias': { color: '#ADD8E6' },
            // Informática
            'Orientación: Gestión Industrial de Sistemas': { color: '#FFFF00' },
            'Orientación: Sistemas Distribuidos': { color: '#7FFFD4' },
            'Orientación: Sistemas de Producción': { color: '#6495ED' },
            // Mecánica
            'Orientación: Diseño Mecánico': { color: '#FFFF00' },
            'Orientación: Termomecánica': { color: '#7FFFD4' },
            'Orientación: Metalúrgica': { color: '#6495ED' },
            'Orientación: Computación Aplicada': { color: '#FFFFE0' },            
            'Orientación: Industrias': { color: '#CCCCB3' },
        },
    };

    network = new vis.Network(container, data, options);          
    network['creditos'] = 0
    return network
}

function createClusterFromCategoria(grupo){
    let cluster = {
        joinCondition:function(nodeOptions) {
            return nodeOptions.categoria === grupo;
        },
        clusterNodeProperties: {id: 'cluster-'+grupo, hidden: true, level:-1, allowSingleNodeCluster:true}
    };
    return cluster
}

function actualizarGrupo(nodo){
    let grupo = nodo.categoria
    if (nodo.aprobada) {grupo = 'Aprobadas' }
    else if (nodo.habilitada) {grupo = 'Habilitadas'}
    nodo.group = grupo
    NODOS.update(nodo)
}

function aprobar(id){
    let nodo = NODOS.get(id)
    nodo.aprobada = true
    network.creditos += NODOS.get(id).creditos
    actualizarGrupo(nodo)

    let neighborsTo = network.getConnectedNodes(id, 'to')
    for (let i = 0; i < neighborsTo.length; i++ ){
        let neighbor = NODOS.get(neighborsTo[i])
        if (!neighbor) {continue}
        habilitar(neighborsTo[i])
    }

    $('#creditos-var').text(network.creditos)
}

function habilitar(id){
    let nodo = NODOS.get(id)
    let neighborsFrom = network.getConnectedNodes(id, 'from')
    let todoAprobado = true
    for (let i = 0; i < neighborsFrom.length; i++ ){
        let correlativa = NODOS.get(neighborsFrom[i])
        if (!correlativa) {continue}
        todoAprobado &= correlativa.aprobada
    }
    if (!todoAprobado || network.creditos < nodo.requiere) {return}

    nodo.habilitada = true
    actualizarGrupo(nodo)
    NODOS.update(nodo)
}

function chequearNodosCRED(id){
    for(let i = 0; i<NODOS_CRED.length;i++){
        let nodo = NODOS_CRED[i]
        if (network.creditos < nodo.requiere) {deshabilitar(nodo.id)}
        else if (network.creditos >= nodo.requiere) {habilitar(nodo.id)}
    }
}

function deshabilitar(id){
    let nodo = NODOS.get(id)
    nodo.habilitada = false
    actualizarGrupo(nodo)
}


function desaprobar(id){
    let nodo = NODOS.get(id)
    nodo.aprobada = false
    network.creditos -= NODOS.get(id).creditos
    actualizarGrupo(nodo)
    
    let neighborsTo = network.getConnectedNodes(id, 'to')
    for (let i = 0; i <neighborsTo.length; i++ ){
        let neighbor = NODOS.get(neighborsTo[i])
        if (!neighbor) {continue}
        deshabilitar(neighborsTo[i])
    }

    $('#creditos-var').text(network.creditos)
}

function parseNode(rowCells){
    let codigo = rowCells[0]
    let label = breakWords(rowCells[1])
    let creditos = rowCells[2]
    let grupo = rowCells[4]
    let nivel = rowCells[5]
    let caveat = rowCells[6]

    let node = {id:codigo, label:label, group:grupo, creditos: parseInt(creditos), aprobada: false, level:nivel, habilitada: false, categoria: grupo}
    if (caveat){ node.title = caveat }
    return node
}

function breakWords(string){
    let broken = ''
    string.split(' ').forEach(element => {
        if (element.length < 5) {broken+=' '+element}
        else {broken+='\n'+element}
    });
    return broken.trim();
}

function bindings() {
    $('.toggle').off('click').on('click',function(){
        let [_, grupo] = $(this).attr('id').split('-')
        if (network.isCluster('cluster-'+grupo)) { network.openCluster('cluster-'+grupo) }
        else {network.cluster(createClusterFromCategoria(grupo))}
    })
    
    network.off('click').on("click", function(params) {
        let id = params.nodes[0]     
        if (!id) {return}
        let aprobada = NODOS.get(id).aprobada
        if (!aprobada) {
            aprobar(id)
        }
        else {
            desaprobar(id)
        }
        chequearNodosCRED()
    })
}
