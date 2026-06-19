// Parses an amenity list passed via query params. Accepts an array, a JSON-
// encoded array string, or a comma-separated legacy string. Comma-fallback
// keeps old saved share links working while titles containing commas (or any
// other special chars) round-trip safely via JSON.
function parseAmenityList(raw) {
	if(raw == null) return []
	if(Array.isArray(raw)) return raw.map(a => String(a)).filter(Boolean)
	let s = String(raw)
	let t = s.trim()
	if(t.charAt(0) === '[') {
		try {
			let arr = JSON.parse(t)
			if(Array.isArray(arr)) return arr.map(a => String(a)).filter(Boolean)
		} catch(e) {}
	}
	return s.split(',').map(a => a.trim()).filter(Boolean)
}

module.exports = {
	formatQuery: function (vars={}, opts={})
	{
		vars.fromPrice = vars.fromPrice?Number(vars.fromPrice):undefined;
		vars.toPrice = vars.toPrice?Number(vars.toPrice):undefined;
		let myfilter = {$and:[]};
		if(vars.fromDate)
		{
			vars.fromDate = new Date(vars.fromDate);
			myfilter.$and.push({datetime:{$gte:vars.fromDate}});
		}

		if(vars.fromPrice)
			myfilter.$and.push({price:{$gte:vars.fromPrice}})

		if(vars.toPrice)
			myfilter.$and.push({price:{$lte:vars.toPrice}})

		if(vars.minBedrooms)
			myfilter.$and.push({bedrooms:{$gte:Number(vars.minBedrooms)}})

		if(vars.minBathrooms)
			myfilter.$and.push({bathrooms:{$gte:Number(vars.minBathrooms)}})

		if(vars.minBeds)
			myfilter.$and.push({beds:{$gte:Number(vars.minBeds)}})

		// Different scrapers use different field names: FB uses sqMeters/parking,
		// QA uses area/parkingSpaces. Match either so the filter works across platforms.
		if(vars.minSqMeters)
			myfilter.$and.push({$or:[
				{sqMeters:{$gte:Number(vars.minSqMeters)}},
				{area:{$gte:Number(vars.minSqMeters)}}
			]})

		if(vars.minParking)
			myfilter.$and.push({$or:[
				{parking:{$gte:Number(vars.minParking)}},
				{parkingSpaces:{$gte:Number(vars.minParking)}}
			]})

		// FB stores English propertyType ("apartment", "house", …); QA stores
		// `type` with Portuguese names. Map the UI's English value to a regex
		// that matches either field across both languages.
		if(vars.propertyType) {
			const ptMap = {
				apartment: ['apartment', 'apartamento'],
				house: ['house', 'casa', 'sobrado'],
				condo: ['condo', 'cobertura'],
				townhouse: ['townhouse'],
				studio: ['studio', 'kitnet'],
				room: ['room', 'quarto']
			}
			const alts = ptMap[String(vars.propertyType).toLowerCase()] || [vars.propertyType]
			const pattern = '^(' + alts.map(a => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')$'
			myfilter.$and.push({$or: [
				{propertyType: {$regex: new RegExp(pattern, 'i')}},
				{type: {$regex: new RegExp(pattern, 'i')}}
			]})
		}

		if(vars.categorySearch)
			myfilter.$and.push({categories:{$regex: new RegExp(vars.categorySearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')}})

		if(vars.minPhotos) {
			let minP = Number(vars.minPhotos)
			if(minP > 0)
				myfilter.$and.push({['picture_urls.'+(minP-1)]: {$exists: true}})
		}

		// Availability date range filter (Airbnb listings)
		if(vars.availableFrom || vars.availableTo) {
			let from = vars.availableFrom ? new Date(vars.availableFrom) : null
			let to = vars.availableTo ? new Date(vars.availableTo) : null
			// If only one date given, treat as single-day or open-ended
			if(from && !to) to = from
			if(to && !from) from = to
			// Generate each date in the range and require available=true
			let current = new Date(from)
			let end = new Date(to)
			let availConditions = []
			let maxDays = 365 // safety cap
			while(current <= end && availConditions.length < maxDays) {
				let dateStr = current.toISOString().substring(0, 10) // YYYY-MM-DD
				availConditions.push({['availability.'+dateStr+'.available']: true})
				current.setDate(current.getDate() + 1)
			}
			if(availConditions.length)
				myfilter.$and.push(...availConditions)
		}

		if(vars.amenities)
		{
			let amenityList = parseAmenityList(vars.amenities)
			if(amenityList.length)
				myfilter.$and.push({amenities:{$all: amenityList}})
		}

		if(vars.orAmenities)
		{
			let orAmenityList = parseAmenityList(vars.orAmenities)
			if(orAmenityList.length)
				myfilter.$and.push({$or: orAmenityList.map(a => ({amenities: a}))})
		}

		//{$text: { $search: " house  -female -females -girl -girls -lady -ladies" } }
		if(vars.searchText)
		{
			let negative=[],
				exact = [],
				positive = []

			vars.searchText = vars.searchText+" "//to match last negative word
			//separate negative phrases first: -"quarto privado" excludes the whole
			//multi-word phrase. Must run before the single-word pass below, otherwise
			//-.+?\s would stop at the first space and only exclude "quarto".
			vars.searchText = vars.searchText.replace(/-"[^"]+"/g, function(a){
				negative.push(a.slice(2, -1))//strip leading -" and trailing "
				return ''
			})
			//separate negative keywords
			vars.searchText = vars.searchText.replace(/-.+?\s/g, function(a, b){//.+? means find until first occurence
				negative.push(a.substr(1).slice(0, -1))
				return ''
			})
			//escape regex metacharacters so phrases containing ( $ . etc. match
			//literally and can't throw on an unbalanced paren and break the query
			let negativeRx = () => negative.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join("|")

			if(vars.searchTitleOnly)
			{
				//separate exact keywords
				vars.searchText = vars.searchText.replace(/".+?"/g, function(a, b){//.+? means find until first occurence
					exact.push(a.substr(1).slice(0, -1))
					return ''
				})
				//prepare multiple positive keywords
				positive = vars.searchText.replace(/\s\s+/g, ' ').trim().split(" ")
				if(positive[0] =="")
					positive=[]
				//merge positive and exact
				vars.searchText = positive.concat(exact)

				vars.searchText = "(.*("+vars.searchText.join("|")+"))"
				if(vars.searchText.length)
					myfilter.$and.push({title: new RegExp(vars.searchText, "gi")})

				if(negative.length)
					myfilter.$and.push( {title:
						{
							"$not": new RegExp(negativeRx(), "i")
						}
					})
			}
			else
			{
				if(vars.searchText.length)
					myfilter.$and.push({$text: { $search: vars.searchText } })
				
				if(negative.length)
					myfilter.$and.push( {"$nor": [
						{
							title: new RegExp(negativeRx(), "i")
						},
						{
							description: new RegExp(negativeRx(), "i")
						}
						]
					})
			}
		}
		console.log("myfilter4")
		const util = require('util');
		console.log(util.inspect(myfilter, { showHidden: false, depth: null, colors: true }))

		if(!opts.skipJobFilter)
		myfilter.$and.push({['jobs.'+vars.jobId]:{$exists:true}})
		console.log("myfilter5", myfilter)
		if(myfilter.$and.length==0)
			return {}
		else 
			return myfilter;
	}
}