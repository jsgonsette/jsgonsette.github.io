class BuddyClient extends WebSocketClient
{
	constructor (uri) {
		super (uri)
	}
	
	get_next_event () {
		var event = this.out_queue.shift ()
		if (event == undefined) return null
		return event
	}
	
	async get_registered_games () {
		
		var games = this.request ("GetRegisteredGames")
		return games
	}
	
	async get_registered_agents () {
		var agents = this.request ("GetRegisteredAgents")
		return agents
	}
	
	async create_agent (str_model) {
		var handle = this.request ("CreateAgent", str_model)
		return handle
	}
	
	async create_external_agent () {
		var handle = this.request ("CreateExternalAgent")
		return handle
	}
	
	async create_contest (game_name, agents, seed=0) {
		var data = new Object ()
		data.game = game_name
		data.agents = agents
		data.seed = seed		

		var handle = this.request ("CreateContest", data)
		return handle
	}
	
	async schedule_contest (handle_contest) {
		var again = this.request ("ScheduleContest", handle_contest)
		return again
	}
	
	async get_legal_actions (handle_contest, handle_agent) {
		
		var data = new Object ()
		data.contest = handle_contest
		data.agent = handle_agent

		var actions = this.request ("GetLegalActions", data)
		return actions
	}
	
	async reply_selected_action (response_id, action) {
		
		this.response (response_id, "GetAgentAction", action)
	}
	
	async close_resource (handle) {
		var result = this.request ("CloseResource")
	}
}