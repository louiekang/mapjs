/*jslint nomen: true*/
/*global _, Color, MAPJS*/
(function () {
	'use strict';
	MAPJS.calculateDimensions = function calculateDimensions(idea, dimensionProvider, margin) {
		var dimensions = dimensionProvider(idea.title),
			result = _.extend(_.pick(idea, ['id', 'title', 'attr']), {
				width: dimensions.width + 2 * margin,
				height: dimensions.height + 2 * margin
			}),
			leftOrRight,
			subIdeaWidths = [0, 0],
			subIdeaHeights = [0, 0],
			subIdeaRank,
			subIdea,
			subIdeaDimensions;
		if (idea.ideas && !idea.getAttr('collapsed')) {
			result.ideas = {};
			for (subIdeaRank in idea.ideas) {
				subIdea = idea.ideas[subIdeaRank];
				subIdeaDimensions = calculateDimensions(subIdea, dimensionProvider, margin);
				result.ideas[subIdeaRank] = subIdeaDimensions;
				leftOrRight = subIdeaRank > 0 ? 1 : 0;
				subIdeaWidths[leftOrRight] = Math.max(subIdeaWidths[leftOrRight], subIdeaDimensions.Width);
				subIdeaHeights[leftOrRight] += subIdeaDimensions.Height;
			}
		}
		result.WidthLeft = subIdeaWidths[0] || 0;
		result.Width = result.width + subIdeaWidths[0] + subIdeaWidths[1];
		result.Height = Math.max(result.height, subIdeaHeights[0], subIdeaHeights[1]);
		return result;
	};
	MAPJS.calculatePositions = function calculatePositions(idea, dimensionProvider, margin, x0, y0, result, isLeftSubtree) {
		var ranks,
			subIdeaRank,
			i,
			subIdeaDimensions,
			leftOrRight,
			totalHeights = [0, 0],
			subIdeaCurrentY0 = [y0, y0];
		result = result || MAPJS.calculateDimensions(idea, dimensionProvider, margin);
		x0 += result.WidthLeft;
		result.x = x0 + margin;
		result.y = y0 + 0.5 * (result.Height - result.height) + margin;
		if (result.ideas) {
			ranks = [];
			for (subIdeaRank in result.ideas) {
				ranks.push(parseFloat(subIdeaRank));
				subIdeaDimensions = result.ideas[subIdeaRank];
				if (isLeftSubtree) {
					subIdeaRank = -subIdeaRank;
				}
				totalHeights[subIdeaRank < 0 ? 0 : 1] += subIdeaDimensions.Height;
			}
			subIdeaCurrentY0[0] += 0.5 * (result.Height - totalHeights[0]);
			subIdeaCurrentY0[1] += 0.5 * (result.Height - totalHeights[1]);
			ranks.sort(function ascending(firstRank, secondRank) {
				if (firstRank >= 0 && secondRank >= 0) {
					return secondRank - firstRank;
				}
				if (firstRank < 0 && secondRank < 0) {
					return firstRank - secondRank;
				}
				return secondRank - firstRank;
			});
			for (i = ranks.length - 1; i >= 0; i -= 1) {
				subIdeaRank = ranks[i];
				subIdeaDimensions = result.ideas[subIdeaRank];
				if (isLeftSubtree) {
					subIdeaRank = -subIdeaRank;
				}
				leftOrRight = subIdeaRank > 0 ? 1 : 0;
				calculatePositions(undefined, dimensionProvider, margin, x0 + (leftOrRight ? result.width : -subIdeaDimensions.width), subIdeaCurrentY0[leftOrRight], subIdeaDimensions, isLeftSubtree || leftOrRight === 0);
				subIdeaCurrentY0[leftOrRight] += subIdeaDimensions.Height;
			}
		}
		return result;
	};
	MAPJS.defaultStyles = {
		root: {background: '#22AAE0'},
		nonRoot: {background: '#E0E0E0'}
	};

	MAPJS.calculateLayout = function (idea, dimensionProvider, margin) {
		margin = margin || 10;
		var result = {
			nodes: {},
			connectors: {},
			links: {}
		},
			root = MAPJS.calculatePositions(idea, dimensionProvider, margin, 0, 0),
			calculateLayoutInner = function (positions, level) {
				var subIdeaRank, from, to, isRoot = level === 1,
					defaultStyle = MAPJS.defaultStyles[isRoot ? 'root' : 'nonRoot'],
					node = _.extend(_.pick(positions, ['id', 'width', 'height', 'title', 'attr']), {
						x: positions.x - root.x - 0.5 * root.width + margin,
						y: positions.y - root.y - 0.5 * root.height + margin,
						level: level
					});
				node.attr = node.attr || {};
				node.attr.style = _.extend({}, defaultStyle, node.attr.style);
				result.nodes[positions.id] = node;
				if (positions.ideas) {
					for (subIdeaRank in positions.ideas) {
						calculateLayoutInner(positions.ideas[subIdeaRank], level + 1);
						from = positions.id;
						to = positions.ideas[subIdeaRank].id;
						result.connectors[to] = {
							from: from,
							to: to
						};
					}
				}
			};
		MAPJS.LayoutCompressor.compress(root);
		calculateLayoutInner(root, 1);
		_.each(idea.links, function (link) {
			if (result.nodes[link.ideaIdFrom] && result.nodes[link.ideaIdTo]) {
				result.links[link.ideaIdFrom + '_' + link.ideaIdTo] = {
					ideaIdFrom: link.ideaIdFrom,
					ideaIdTo: link.ideaIdTo,
					attr: _.clone(link.attr)
				};
				//todo - clone
			}
		});
		return result;
	};
	MAPJS.calculateFrame = function (nodes, margin) {
		margin = margin || 0;
		var result = {
			top: _.min(nodes, function (node) {return node.y; }).y - margin,
			left: _.min(nodes, function (node) {return node.x; }).x - margin
		};
		result.width = margin + _.max(_.map(nodes, function (node) { return node.x + node.width; })) - result.left;
		result.height = margin + _.max(_.map(nodes, function (node) { return node.y + node.height; })) - result.top;
		return result;
	};
	MAPJS.contrastForeground = function (background) {
		/*jslint newcap:true*/
		var luminosity = Color(background).luminosity();
		if (luminosity < 0.5) {
			return '#EEEEEE';
		}
		if (luminosity < 0.9) {
			return '#4F4F4F';
		}
		return '#000000';
	};
}());
MAPJS.Outline = function (topBorder, bottomBorder) {
	var shiftBorder = function (border, deltaH) {
		return _.map (border, function (segment) {
			return { 
				l: segment.l,
				h: segment.h + deltaH
			}
		});
	}
	this.initialHeight = function () {
		return this.bottom[0].h - this.top[0].h;
	}
	this.extend = function (dl) {
		this.top[0].l += dl;
		this.bottom[0].l += dl;
		return this;
	};
	this.borders = function () {
		return _.pick(this, 'top', 'bottom');
	};
	this.spacingAbove = function (outline) {
		return this.bottom[0].h - outline.top[0].h;
	};
	this.stackBelow = function (outline, margin) {
		var spacing = outline.spacingAbove(this),
			totalHeight = this.initialHeight() + outline.initialHeight() + margin;
		return new MAPJS.Outline(
			shiftBorder(outline.top, - 0.5 * totalHeight  - outline.top[0].h ),
			shiftBorder(this.bottom, 0.5 * totalHeight - this.bottom[0].h)
		);
	};
	this.subOutlines = function () {
		return [];
	}
	
	this.top = topBorder.slice();
	this.bottom = bottomBorder.slice();
};
MAPJS.calculateOutline = function (idea, dimensionProvider, margin) {
	margin = margin || 10;
	var dimensions = dimensionProvider(idea),
		ideas = idea.sortedSubIdeas(),
		result = new MAPJS.Outline([{
				h: -0.5 * dimensions.height,
				l: dimensions.width
			}], [{
				h: 0.5 * dimensions.height,
				l: dimensions.width
			}]
		);
	if (ideas.length) {
		var subOutline = MAPJS.calculateOutline(ideas.shift(), dimensionProvider, margin);
		ideas.forEach(function (i) {
			var outline = MAPJS.calculateOutline(i, dimensionProvider);
			subOutline = outline.stackBelow(subOutline, margin);
		});
		subOutline.extend(margin);
		result.top = result.top.concat(subOutline.top);
		result.bottom = result.bottom.concat(subOutline.bottom);
	}
	return result;
};
MAPJS.Tree = function (options) {
	_.extend(this, options);
	this.toLayout = function (level, x, y) {
		x = x || 0;
		y = y || 0;
		var result = {
			nodes: {},
			links: {},
			connectors: {}
		}, self;
		self = _.pick(this, 'id', 'title', 'attr');
		self.level = level || 1;
		if (self.level === 1) {
			self.x = -0.5 * this.width;
			self.y = -0.5 * this.height;
		} else {
			self.x = x + this.deltaX || 0,
			self.y = y + this.deltaY || 0
		}
		result.nodes[this.id] = self;
		if (this.subtrees) {
			this.subtrees.forEach(function (t) {
				var subLayout = t.toLayout(self.level + 1, self.x, self.y);
				_.extend(result.nodes, subLayout.nodes);
			});
		}
		return result;
	};
};
MAPJS.calculateTree = function (content, dimensionProvider, margin) {
	var options = {
		id: content.id,
		title: content.title,
		attr: content.attr
	};
	_.extend(options, dimensionProvider(content));
	options.subtrees = _.map(content.sortedSubIdeas(), function (i) {
		var subtree = MAPJS.calculateTree(i, dimensionProvider, margin);
		subtree.deltaX = options.width + margin;
		subtree.deltaY = (options.height - subtree.height) * 0.5;
		return subtree;
	});
	return new MAPJS.Tree(options);
};
