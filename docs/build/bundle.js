
(function(l, r) { if (l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (window.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(window.document);
var app = (function () {
    'use strict';

    function noop() { }
    function is_promise(value) {
        return value && typeof value === 'object' && typeof value.then === 'function';
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function not_equal(a, b) {
        return a != a ? b == b : a !== b;
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function empty() {
        return text('');
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function onDestroy(fn) {
        get_current_component().$$.on_destroy.push(fn);
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function tick() {
        schedule_update();
        return resolved_promise;
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }

    function handle_promise(promise, info) {
        const token = info.token = {};
        function update(type, index, key, value) {
            if (info.token !== token)
                return;
            info.resolved = value;
            let child_ctx = info.ctx;
            if (key !== undefined) {
                child_ctx = child_ctx.slice();
                child_ctx[key] = value;
            }
            const block = type && (info.current = type)(child_ctx);
            let needs_flush = false;
            if (info.block) {
                if (info.blocks) {
                    info.blocks.forEach((block, i) => {
                        if (i !== index && block) {
                            group_outros();
                            transition_out(block, 1, 1, () => {
                                if (info.blocks[i] === block) {
                                    info.blocks[i] = null;
                                }
                            });
                            check_outros();
                        }
                    });
                }
                else {
                    info.block.d(1);
                }
                block.c();
                transition_in(block, 1);
                block.m(info.mount(), info.anchor);
                needs_flush = true;
            }
            info.block = block;
            if (info.blocks)
                info.blocks[index] = block;
            if (needs_flush) {
                flush();
            }
        }
        if (is_promise(promise)) {
            const current_component = get_current_component();
            promise.then(value => {
                set_current_component(current_component);
                update(info.then, 1, info.value, value);
                set_current_component(null);
            }, error => {
                set_current_component(current_component);
                update(info.catch, 2, info.error, error);
                set_current_component(null);
                if (!info.hasCatch) {
                    throw error;
                }
            });
            // if we previously had a then/catch block, destroy it
            if (info.current !== info.pending) {
                update(info.pending, 0);
                return true;
            }
        }
        else {
            if (info.current !== info.then) {
                update(info.then, 1, info.value, promise);
                return true;
            }
            info.resolved = promise;
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    var bail_1 = bail;

    function bail(err) {
      if (err) {
        throw err
      }
    }

    /*!
     * Determine if an object is a Buffer
     *
     * @author   Feross Aboukhadijeh <https://feross.org>
     * @license  MIT
     */

    var isBuffer = function isBuffer (obj) {
      return obj != null && obj.constructor != null &&
        typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
    };

    var hasOwn = Object.prototype.hasOwnProperty;
    var toStr = Object.prototype.toString;
    var defineProperty = Object.defineProperty;
    var gOPD = Object.getOwnPropertyDescriptor;

    var isArray = function isArray(arr) {
    	if (typeof Array.isArray === 'function') {
    		return Array.isArray(arr);
    	}

    	return toStr.call(arr) === '[object Array]';
    };

    var isPlainObject = function isPlainObject(obj) {
    	if (!obj || toStr.call(obj) !== '[object Object]') {
    		return false;
    	}

    	var hasOwnConstructor = hasOwn.call(obj, 'constructor');
    	var hasIsPrototypeOf = obj.constructor && obj.constructor.prototype && hasOwn.call(obj.constructor.prototype, 'isPrototypeOf');
    	// Not own constructor property must be Object
    	if (obj.constructor && !hasOwnConstructor && !hasIsPrototypeOf) {
    		return false;
    	}

    	// Own properties are enumerated firstly, so to speed up,
    	// if last one is own, then all properties are own.
    	var key;
    	for (key in obj) { /**/ }

    	return typeof key === 'undefined' || hasOwn.call(obj, key);
    };

    // If name is '__proto__', and Object.defineProperty is available, define __proto__ as an own property on target
    var setProperty = function setProperty(target, options) {
    	if (defineProperty && options.name === '__proto__') {
    		defineProperty(target, options.name, {
    			enumerable: true,
    			configurable: true,
    			value: options.newValue,
    			writable: true
    		});
    	} else {
    		target[options.name] = options.newValue;
    	}
    };

    // Return undefined instead of __proto__ if '__proto__' is not an own property
    var getProperty = function getProperty(obj, name) {
    	if (name === '__proto__') {
    		if (!hasOwn.call(obj, name)) {
    			return void 0;
    		} else if (gOPD) {
    			// In early versions of node, obj['__proto__'] is buggy when obj has
    			// __proto__ as an own property. Object.getOwnPropertyDescriptor() works.
    			return gOPD(obj, name).value;
    		}
    	}

    	return obj[name];
    };

    var extend = function extend() {
    	var options, name, src, copy, copyIsArray, clone;
    	var target = arguments[0];
    	var i = 1;
    	var length = arguments.length;
    	var deep = false;

    	// Handle a deep copy situation
    	if (typeof target === 'boolean') {
    		deep = target;
    		target = arguments[1] || {};
    		// skip the boolean and the target
    		i = 2;
    	}
    	if (target == null || (typeof target !== 'object' && typeof target !== 'function')) {
    		target = {};
    	}

    	for (; i < length; ++i) {
    		options = arguments[i];
    		// Only deal with non-null/undefined values
    		if (options != null) {
    			// Extend the base object
    			for (name in options) {
    				src = getProperty(target, name);
    				copy = getProperty(options, name);

    				// Prevent never-ending loop
    				if (target !== copy) {
    					// Recurse if we're merging plain objects or arrays
    					if (deep && copy && (isPlainObject(copy) || (copyIsArray = isArray(copy)))) {
    						if (copyIsArray) {
    							copyIsArray = false;
    							clone = src && isArray(src) ? src : [];
    						} else {
    							clone = src && isPlainObject(src) ? src : {};
    						}

    						// Never move original objects, clone them
    						setProperty(target, { name: name, newValue: extend(deep, clone, copy) });

    					// Don't bring in undefined values
    					} else if (typeof copy !== 'undefined') {
    						setProperty(target, { name: name, newValue: copy });
    					}
    				}
    			}
    		}
    	}

    	// Return the modified object
    	return target;
    };

    var isPlainObj = value => {
    	if (Object.prototype.toString.call(value) !== '[object Object]') {
    		return false;
    	}

    	const prototype = Object.getPrototypeOf(value);
    	return prototype === null || prototype === Object.prototype;
    };

    var slice = [].slice;

    var wrap_1 = wrap;

    // Wrap `fn`.
    // Can be sync or async; return a promise, receive a completion handler, return
    // new values and errors.
    function wrap(fn, callback) {
      var invoked;

      return wrapped

      function wrapped() {
        var params = slice.call(arguments, 0);
        var callback = fn.length > params.length;
        var result;

        if (callback) {
          params.push(done);
        }

        try {
          result = fn.apply(null, params);
        } catch (error) {
          // Well, this is quite the pickle.
          // `fn` received a callback and invoked it (thus continuing the pipeline),
          // but later also threw an error.
          // We’re not about to restart the pipeline again, so the only thing left
          // to do is to throw the thing instead.
          if (callback && invoked) {
            throw error
          }

          return done(error)
        }

        if (!callback) {
          if (result && typeof result.then === 'function') {
            result.then(then, done);
          } else if (result instanceof Error) {
            done(result);
          } else {
            then(result);
          }
        }
      }

      // Invoke `next`, only once.
      function done() {
        if (!invoked) {
          invoked = true;

          callback.apply(null, arguments);
        }
      }

      // Invoke `done` with one value.
      // Tracks if an error is passed, too.
      function then(value) {
        done(null, value);
      }
    }

    var trough_1 = trough;

    trough.wrap = wrap_1;

    var slice$1 = [].slice;

    // Create new middleware.
    function trough() {
      var fns = [];
      var middleware = {};

      middleware.run = run;
      middleware.use = use;

      return middleware

      // Run `fns`.  Last argument must be a completion handler.
      function run() {
        var index = -1;
        var input = slice$1.call(arguments, 0, -1);
        var done = arguments[arguments.length - 1];

        if (typeof done !== 'function') {
          throw new Error('Expected function as last argument, not ' + done)
        }

        next.apply(null, [null].concat(input));

        // Run the next `fn`, if any.
        function next(err) {
          var fn = fns[++index];
          var params = slice$1.call(arguments, 0);
          var values = params.slice(1);
          var length = input.length;
          var pos = -1;

          if (err) {
            done(err);
            return
          }

          // Copy non-nully input into values.
          while (++pos < length) {
            if (values[pos] === null || values[pos] === undefined) {
              values[pos] = input[pos];
            }
          }

          input = values;

          // Next or done.
          if (fn) {
            wrap_1(fn, next).apply(null, input);
          } else {
            done.apply(null, [null].concat(input));
          }
        }
      }

      // Add `fn` to the list.
      function use(fn) {
        if (typeof fn !== 'function') {
          throw new Error('Expected `fn` to be a function, not ' + fn)
        }

        fns.push(fn);

        return middleware
      }
    }

    var own = {}.hasOwnProperty;

    var unistUtilStringifyPosition = stringify;

    function stringify(value) {
      // Nothing.
      if (!value || typeof value !== 'object') {
        return ''
      }

      // Node.
      if (own.call(value, 'position') || own.call(value, 'type')) {
        return position(value.position)
      }

      // Position.
      if (own.call(value, 'start') || own.call(value, 'end')) {
        return position(value)
      }

      // Point.
      if (own.call(value, 'line') || own.call(value, 'column')) {
        return point(value)
      }

      // ?
      return ''
    }

    function point(point) {
      if (!point || typeof point !== 'object') {
        point = {};
      }

      return index(point.line) + ':' + index(point.column)
    }

    function position(pos) {
      if (!pos || typeof pos !== 'object') {
        pos = {};
      }

      return point(pos.start) + '-' + point(pos.end)
    }

    function index(value) {
      return value && typeof value === 'number' ? value : 1
    }

    var vfileMessage = VMessage;

    // Inherit from `Error#`.
    function VMessagePrototype() {}
    VMessagePrototype.prototype = Error.prototype;
    VMessage.prototype = new VMessagePrototype();

    // Message properties.
    var proto = VMessage.prototype;

    proto.file = '';
    proto.name = '';
    proto.reason = '';
    proto.message = '';
    proto.stack = '';
    proto.fatal = null;
    proto.column = null;
    proto.line = null;

    // Construct a new VMessage.
    //
    // Note: We cannot invoke `Error` on the created context, as that adds readonly
    // `line` and `column` attributes on Safari 9, thus throwing and failing the
    // data.
    function VMessage(reason, position, origin) {
      var parts;
      var range;
      var location;

      if (typeof position === 'string') {
        origin = position;
        position = null;
      }

      parts = parseOrigin(origin);
      range = unistUtilStringifyPosition(position) || '1:1';

      location = {
        start: {line: null, column: null},
        end: {line: null, column: null}
      };

      // Node.
      if (position && position.position) {
        position = position.position;
      }

      if (position) {
        // Position.
        if (position.start) {
          location = position;
          position = position.start;
        } else {
          // Point.
          location.start = position;
        }
      }

      if (reason.stack) {
        this.stack = reason.stack;
        reason = reason.message;
      }

      this.message = reason;
      this.name = range;
      this.reason = reason;
      this.line = position ? position.line : null;
      this.column = position ? position.column : null;
      this.location = location;
      this.source = parts[0];
      this.ruleId = parts[1];
    }

    function parseOrigin(origin) {
      var result = [null, null];
      var index;

      if (typeof origin === 'string') {
        index = origin.indexOf(':');

        if (index === -1) {
          result[1] = origin;
        } else {
          result[0] = origin.slice(0, index);
          result[1] = origin.slice(index + 1);
        }
      }

      return result
    }

    // A derivative work based on:
    // <https://github.com/browserify/path-browserify>.
    // Which is licensed:
    //
    // MIT License
    //
    // Copyright (c) 2013 James Halliday
    //
    // Permission is hereby granted, free of charge, to any person obtaining a copy of
    // this software and associated documentation files (the "Software"), to deal in
    // the Software without restriction, including without limitation the rights to
    // use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
    // the Software, and to permit persons to whom the Software is furnished to do so,
    // subject to the following conditions:
    //
    // The above copyright notice and this permission notice shall be included in all
    // copies or substantial portions of the Software.
    //
    // THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    // IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
    // FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
    // COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
    // IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
    // CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
    // A derivative work based on:
    //
    // Parts of that are extracted from Node’s internal `path` module:
    // <https://github.com/nodejs/node/blob/master/lib/path.js>.
    // Which is licensed:
    //
    // Copyright Joyent, Inc. and other Node contributors.
    //
    // Permission is hereby granted, free of charge, to any person obtaining a
    // copy of this software and associated documentation files (the
    // "Software"), to deal in the Software without restriction, including
    // without limitation the rights to use, copy, modify, merge, publish,
    // distribute, sublicense, and/or sell copies of the Software, and to permit
    // persons to whom the Software is furnished to do so, subject to the
    // following conditions:
    //
    // The above copyright notice and this permission notice shall be included
    // in all copies or substantial portions of the Software.
    //
    // THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
    // OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
    // MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
    // NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
    // DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
    // OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
    // USE OR OTHER DEALINGS IN THE SOFTWARE.

    var basename_1 = basename;
    var dirname_1 = dirname;
    var extname_1 = extname;
    var join_1 = join;
    var sep = '/';

    function basename(path, ext) {
      var start = 0;
      var end = -1;
      var index;
      var firstNonSlashEnd;
      var seenNonSlash;
      var extIndex;

      if (ext !== undefined && typeof ext !== 'string') {
        throw new TypeError('"ext" argument must be a string')
      }

      assertPath(path);
      index = path.length;

      if (ext === undefined || !ext.length || ext.length > path.length) {
        while (index--) {
          if (path.charCodeAt(index) === 47 /* `/` */) {
            // If we reached a path separator that was not part of a set of path
            // separators at the end of the string, stop now.
            if (seenNonSlash) {
              start = index + 1;
              break
            }
          } else if (end < 0) {
            // We saw the first non-path separator, mark this as the end of our
            // path component.
            seenNonSlash = true;
            end = index + 1;
          }
        }

        return end < 0 ? '' : path.slice(start, end)
      }

      if (ext === path) {
        return ''
      }

      firstNonSlashEnd = -1;
      extIndex = ext.length - 1;

      while (index--) {
        if (path.charCodeAt(index) === 47 /* `/` */) {
          // If we reached a path separator that was not part of a set of path
          // separators at the end of the string, stop now.
          if (seenNonSlash) {
            start = index + 1;
            break
          }
        } else {
          if (firstNonSlashEnd < 0) {
            // We saw the first non-path separator, remember this index in case
            // we need it if the extension ends up not matching.
            seenNonSlash = true;
            firstNonSlashEnd = index + 1;
          }

          if (extIndex > -1) {
            // Try to match the explicit extension.
            if (path.charCodeAt(index) === ext.charCodeAt(extIndex--)) {
              if (extIndex < 0) {
                // We matched the extension, so mark this as the end of our path
                // component
                end = index;
              }
            } else {
              // Extension does not match, so our result is the entire path
              // component
              extIndex = -1;
              end = firstNonSlashEnd;
            }
          }
        }
      }

      if (start === end) {
        end = firstNonSlashEnd;
      } else if (end < 0) {
        end = path.length;
      }

      return path.slice(start, end)
    }

    function dirname(path) {
      var end;
      var unmatchedSlash;
      var index;

      assertPath(path);

      if (!path.length) {
        return '.'
      }

      end = -1;
      index = path.length;

      // Prefix `--` is important to not run on `0`.
      while (--index) {
        if (path.charCodeAt(index) === 47 /* `/` */) {
          if (unmatchedSlash) {
            end = index;
            break
          }
        } else if (!unmatchedSlash) {
          // We saw the first non-path separator
          unmatchedSlash = true;
        }
      }

      return end < 0
        ? path.charCodeAt(0) === 47 /* `/` */
          ? '/'
          : '.'
        : end === 1 && path.charCodeAt(0) === 47 /* `/` */
        ? '//'
        : path.slice(0, end)
    }

    function extname(path) {
      var startDot = -1;
      var startPart = 0;
      var end = -1;
      // Track the state of characters (if any) we see before our first dot and
      // after any path separator we find.
      var preDotState = 0;
      var unmatchedSlash;
      var code;
      var index;

      assertPath(path);

      index = path.length;

      while (index--) {
        code = path.charCodeAt(index);

        if (code === 47 /* `/` */) {
          // If we reached a path separator that was not part of a set of path
          // separators at the end of the string, stop now.
          if (unmatchedSlash) {
            startPart = index + 1;
            break
          }

          continue
        }

        if (end < 0) {
          // We saw the first non-path separator, mark this as the end of our
          // extension.
          unmatchedSlash = true;
          end = index + 1;
        }

        if (code === 46 /* `.` */) {
          // If this is our first dot, mark it as the start of our extension.
          if (startDot < 0) {
            startDot = index;
          } else if (preDotState !== 1) {
            preDotState = 1;
          }
        } else if (startDot > -1) {
          // We saw a non-dot and non-path separator before our dot, so we should
          // have a good chance at having a non-empty extension.
          preDotState = -1;
        }
      }

      if (
        startDot < 0 ||
        end < 0 ||
        // We saw a non-dot character immediately before the dot.
        preDotState === 0 ||
        // The (right-most) trimmed path component is exactly `..`.
        (preDotState === 1 && startDot === end - 1 && startDot === startPart + 1)
      ) {
        return ''
      }

      return path.slice(startDot, end)
    }

    function join() {
      var index = -1;
      var joined;

      while (++index < arguments.length) {
        assertPath(arguments[index]);

        if (arguments[index]) {
          joined =
            joined === undefined
              ? arguments[index]
              : joined + '/' + arguments[index];
        }
      }

      return joined === undefined ? '.' : normalize(joined)
    }

    // Note: `normalize` is not exposed as `path.normalize`, so some code is
    // manually removed from it.
    function normalize(path) {
      var absolute;
      var value;

      assertPath(path);

      absolute = path.charCodeAt(0) === 47; /* `/` */

      // Normalize the path according to POSIX rules.
      value = normalizeString(path, !absolute);

      if (!value.length && !absolute) {
        value = '.';
      }

      if (value.length && path.charCodeAt(path.length - 1) === 47 /* / */) {
        value += '/';
      }

      return absolute ? '/' + value : value
    }

    // Resolve `.` and `..` elements in a path with directory names.
    function normalizeString(path, allowAboveRoot) {
      var result = '';
      var lastSegmentLength = 0;
      var lastSlash = -1;
      var dots = 0;
      var index = -1;
      var code;
      var lastSlashIndex;

      while (++index <= path.length) {
        if (index < path.length) {
          code = path.charCodeAt(index);
        } else if (code === 47 /* `/` */) {
          break
        } else {
          code = 47; /* `/` */
        }

        if (code === 47 /* `/` */) {
          if (lastSlash === index - 1 || dots === 1) ; else if (lastSlash !== index - 1 && dots === 2) {
            if (
              result.length < 2 ||
              lastSegmentLength !== 2 ||
              result.charCodeAt(result.length - 1) !== 46 /* `.` */ ||
              result.charCodeAt(result.length - 2) !== 46 /* `.` */
            ) {
              if (result.length > 2) {
                lastSlashIndex = result.lastIndexOf('/');

                /* istanbul ignore else - No clue how to cover it. */
                if (lastSlashIndex !== result.length - 1) {
                  if (lastSlashIndex < 0) {
                    result = '';
                    lastSegmentLength = 0;
                  } else {
                    result = result.slice(0, lastSlashIndex);
                    lastSegmentLength = result.length - 1 - result.lastIndexOf('/');
                  }

                  lastSlash = index;
                  dots = 0;
                  continue
                }
              } else if (result.length) {
                result = '';
                lastSegmentLength = 0;
                lastSlash = index;
                dots = 0;
                continue
              }
            }

            if (allowAboveRoot) {
              result = result.length ? result + '/..' : '..';
              lastSegmentLength = 2;
            }
          } else {
            if (result.length) {
              result += '/' + path.slice(lastSlash + 1, index);
            } else {
              result = path.slice(lastSlash + 1, index);
            }

            lastSegmentLength = index - lastSlash - 1;
          }

          lastSlash = index;
          dots = 0;
        } else if (code === 46 /* `.` */ && dots > -1) {
          dots++;
        } else {
          dots = -1;
        }
      }

      return result
    }

    function assertPath(path) {
      if (typeof path !== 'string') {
        throw new TypeError(
          'Path must be a string. Received ' + JSON.stringify(path)
        )
      }
    }

    var minpath_browser = {
    	basename: basename_1,
    	dirname: dirname_1,
    	extname: extname_1,
    	join: join_1,
    	sep: sep
    };

    // Somewhat based on:
    // <https://github.com/defunctzombie/node-process/blob/master/browser.js>.
    // But I don’t think one tiny line of code can be copyrighted. 😅
    var cwd_1 = cwd;

    function cwd() {
      return '/'
    }

    var minproc_browser = {
    	cwd: cwd_1
    };

    var core = VFile;

    var own$1 = {}.hasOwnProperty;

    // Order of setting (least specific to most), we need this because otherwise
    // `{stem: 'a', path: '~/b.js'}` would throw, as a path is needed before a
    // stem can be set.
    var order = ['history', 'path', 'basename', 'stem', 'extname', 'dirname'];

    VFile.prototype.toString = toString;

    // Access full path (`~/index.min.js`).
    Object.defineProperty(VFile.prototype, 'path', {get: getPath, set: setPath});

    // Access parent path (`~`).
    Object.defineProperty(VFile.prototype, 'dirname', {
      get: getDirname,
      set: setDirname
    });

    // Access basename (`index.min.js`).
    Object.defineProperty(VFile.prototype, 'basename', {
      get: getBasename,
      set: setBasename
    });

    // Access extname (`.js`).
    Object.defineProperty(VFile.prototype, 'extname', {
      get: getExtname,
      set: setExtname
    });

    // Access stem (`index.min`).
    Object.defineProperty(VFile.prototype, 'stem', {get: getStem, set: setStem});

    // Construct a new file.
    function VFile(options) {
      var prop;
      var index;

      if (!options) {
        options = {};
      } else if (typeof options === 'string' || isBuffer(options)) {
        options = {contents: options};
      } else if ('message' in options && 'messages' in options) {
        return options
      }

      if (!(this instanceof VFile)) {
        return new VFile(options)
      }

      this.data = {};
      this.messages = [];
      this.history = [];
      this.cwd = minproc_browser.cwd();

      // Set path related properties in the correct order.
      index = -1;

      while (++index < order.length) {
        prop = order[index];

        if (own$1.call(options, prop)) {
          this[prop] = options[prop];
        }
      }

      // Set non-path related properties.
      for (prop in options) {
        if (order.indexOf(prop) < 0) {
          this[prop] = options[prop];
        }
      }
    }

    function getPath() {
      return this.history[this.history.length - 1]
    }

    function setPath(path) {
      assertNonEmpty(path, 'path');

      if (this.path !== path) {
        this.history.push(path);
      }
    }

    function getDirname() {
      return typeof this.path === 'string' ? minpath_browser.dirname(this.path) : undefined
    }

    function setDirname(dirname) {
      assertPath$1(this.path, 'dirname');
      this.path = minpath_browser.join(dirname || '', this.basename);
    }

    function getBasename() {
      return typeof this.path === 'string' ? minpath_browser.basename(this.path) : undefined
    }

    function setBasename(basename) {
      assertNonEmpty(basename, 'basename');
      assertPart(basename, 'basename');
      this.path = minpath_browser.join(this.dirname || '', basename);
    }

    function getExtname() {
      return typeof this.path === 'string' ? minpath_browser.extname(this.path) : undefined
    }

    function setExtname(extname) {
      assertPart(extname, 'extname');
      assertPath$1(this.path, 'extname');

      if (extname) {
        if (extname.charCodeAt(0) !== 46 /* `.` */) {
          throw new Error('`extname` must start with `.`')
        }

        if (extname.indexOf('.', 1) > -1) {
          throw new Error('`extname` cannot contain multiple dots')
        }
      }

      this.path = minpath_browser.join(this.dirname, this.stem + (extname || ''));
    }

    function getStem() {
      return typeof this.path === 'string'
        ? minpath_browser.basename(this.path, this.extname)
        : undefined
    }

    function setStem(stem) {
      assertNonEmpty(stem, 'stem');
      assertPart(stem, 'stem');
      this.path = minpath_browser.join(this.dirname || '', stem + (this.extname || ''));
    }

    // Get the value of the file.
    function toString(encoding) {
      return (this.contents || '').toString(encoding)
    }

    // Assert that `part` is not a path (i.e., does not contain `p.sep`).
    function assertPart(part, name) {
      if (part && part.indexOf(minpath_browser.sep) > -1) {
        throw new Error(
          '`' + name + '` cannot be a path: did not expect `' + minpath_browser.sep + '`'
        )
      }
    }

    // Assert that `part` is not empty.
    function assertNonEmpty(part, name) {
      if (!part) {
        throw new Error('`' + name + '` cannot be empty')
      }
    }

    // Assert `path` exists.
    function assertPath$1(path, name) {
      if (!path) {
        throw new Error('Setting `' + name + '` requires `path` to be set too')
      }
    }

    var lib = core;

    core.prototype.message = message;
    core.prototype.info = info;
    core.prototype.fail = fail;

    // Create a message with `reason` at `position`.
    // When an error is passed in as `reason`, copies the stack.
    function message(reason, position, origin) {
      var message = new vfileMessage(reason, position, origin);

      if (this.path) {
        message.name = this.path + ':' + message.name;
        message.file = this.path;
      }

      message.fatal = false;

      this.messages.push(message);

      return message
    }

    // Fail: creates a vmessage, associates it with the file, and throws it.
    function fail() {
      var message = this.message.apply(this, arguments);

      message.fatal = true;

      throw message
    }

    // Info: creates a vmessage, associates it with the file, and marks the fatality
    // as null.
    function info() {
      var message = this.message.apply(this, arguments);

      message.fatal = null;

      return message
    }

    var vfile = lib;

    // Expose a frozen processor.
    var unified_1 = unified().freeze();

    var slice$2 = [].slice;
    var own$2 = {}.hasOwnProperty;

    // Process pipeline.
    var pipeline = trough_1()
      .use(pipelineParse)
      .use(pipelineRun)
      .use(pipelineStringify);

    function pipelineParse(p, ctx) {
      ctx.tree = p.parse(ctx.file);
    }

    function pipelineRun(p, ctx, next) {
      p.run(ctx.tree, ctx.file, done);

      function done(err, tree, file) {
        if (err) {
          next(err);
        } else {
          ctx.tree = tree;
          ctx.file = file;
          next();
        }
      }
    }

    function pipelineStringify(p, ctx) {
      var result = p.stringify(ctx.tree, ctx.file);
      var file = ctx.file;

      if (result === undefined || result === null) ; else if (typeof result === 'string' || isBuffer(result)) {
        file.contents = result;
      } else {
        file.result = result;
      }
    }

    // Function to create the first processor.
    function unified() {
      var attachers = [];
      var transformers = trough_1();
      var namespace = {};
      var frozen = false;
      var freezeIndex = -1;

      // Data management.
      processor.data = data;

      // Lock.
      processor.freeze = freeze;

      // Plugins.
      processor.attachers = attachers;
      processor.use = use;

      // API.
      processor.parse = parse;
      processor.stringify = stringify;
      processor.run = run;
      processor.runSync = runSync;
      processor.process = process;
      processor.processSync = processSync;

      // Expose.
      return processor

      // Create a new processor based on the processor in the current scope.
      function processor() {
        var destination = unified();
        var length = attachers.length;
        var index = -1;

        while (++index < length) {
          destination.use.apply(null, attachers[index]);
        }

        destination.data(extend(true, {}, namespace));

        return destination
      }

      // Freeze: used to signal a processor that has finished configuration.
      //
      // For example, take unified itself: it’s frozen.
      // Plugins should not be added to it.
      // Rather, it should be extended, by invoking it, before modifying it.
      //
      // In essence, always invoke this when exporting a processor.
      function freeze() {
        var values;
        var plugin;
        var options;
        var transformer;

        if (frozen) {
          return processor
        }

        while (++freezeIndex < attachers.length) {
          values = attachers[freezeIndex];
          plugin = values[0];
          options = values[1];
          transformer = null;

          if (options === false) {
            continue
          }

          if (options === true) {
            values[1] = undefined;
          }

          transformer = plugin.apply(processor, values.slice(1));

          if (typeof transformer === 'function') {
            transformers.use(transformer);
          }
        }

        frozen = true;
        freezeIndex = Infinity;

        return processor
      }

      // Data management.
      // Getter / setter for processor-specific informtion.
      function data(key, value) {
        if (typeof key === 'string') {
          // Set `key`.
          if (arguments.length === 2) {
            assertUnfrozen('data', frozen);

            namespace[key] = value;

            return processor
          }

          // Get `key`.
          return (own$2.call(namespace, key) && namespace[key]) || null
        }

        // Set space.
        if (key) {
          assertUnfrozen('data', frozen);
          namespace = key;
          return processor
        }

        // Get space.
        return namespace
      }

      // Plugin management.
      //
      // Pass it:
      // *   an attacher and options,
      // *   a preset,
      // *   a list of presets, attachers, and arguments (list of attachers and
      //     options).
      function use(value) {
        var settings;

        assertUnfrozen('use', frozen);

        if (value === null || value === undefined) ; else if (typeof value === 'function') {
          addPlugin.apply(null, arguments);
        } else if (typeof value === 'object') {
          if ('length' in value) {
            addList(value);
          } else {
            addPreset(value);
          }
        } else {
          throw new Error('Expected usable value, not `' + value + '`')
        }

        if (settings) {
          namespace.settings = extend(namespace.settings || {}, settings);
        }

        return processor

        function addPreset(result) {
          addList(result.plugins);

          if (result.settings) {
            settings = extend(settings || {}, result.settings);
          }
        }

        function add(value) {
          if (typeof value === 'function') {
            addPlugin(value);
          } else if (typeof value === 'object') {
            if ('length' in value) {
              addPlugin.apply(null, value);
            } else {
              addPreset(value);
            }
          } else {
            throw new Error('Expected usable value, not `' + value + '`')
          }
        }

        function addList(plugins) {
          var length;
          var index;

          if (plugins === null || plugins === undefined) ; else if (typeof plugins === 'object' && 'length' in plugins) {
            length = plugins.length;
            index = -1;

            while (++index < length) {
              add(plugins[index]);
            }
          } else {
            throw new Error('Expected a list of plugins, not `' + plugins + '`')
          }
        }

        function addPlugin(plugin, value) {
          var entry = find(plugin);

          if (entry) {
            if (isPlainObj(entry[1]) && isPlainObj(value)) {
              value = extend(entry[1], value);
            }

            entry[1] = value;
          } else {
            attachers.push(slice$2.call(arguments));
          }
        }
      }

      function find(plugin) {
        var length = attachers.length;
        var index = -1;
        var entry;

        while (++index < length) {
          entry = attachers[index];

          if (entry[0] === plugin) {
            return entry
          }
        }
      }

      // Parse a file (in string or vfile representation) into a unist node using
      // the `Parser` on the processor.
      function parse(doc) {
        var file = vfile(doc);
        var Parser;

        freeze();
        Parser = processor.Parser;
        assertParser('parse', Parser);

        if (newable(Parser, 'parse')) {
          return new Parser(String(file), file).parse()
        }

        return Parser(String(file), file) // eslint-disable-line new-cap
      }

      // Run transforms on a unist node representation of a file (in string or
      // vfile representation), async.
      function run(node, file, cb) {
        assertNode(node);
        freeze();

        if (!cb && typeof file === 'function') {
          cb = file;
          file = null;
        }

        if (!cb) {
          return new Promise(executor)
        }

        executor(null, cb);

        function executor(resolve, reject) {
          transformers.run(node, vfile(file), done);

          function done(err, tree, file) {
            tree = tree || node;
            if (err) {
              reject(err);
            } else if (resolve) {
              resolve(tree);
            } else {
              cb(null, tree, file);
            }
          }
        }
      }

      // Run transforms on a unist node representation of a file (in string or
      // vfile representation), sync.
      function runSync(node, file) {
        var complete = false;
        var result;

        run(node, file, done);

        assertDone('runSync', 'run', complete);

        return result

        function done(err, tree) {
          complete = true;
          bail_1(err);
          result = tree;
        }
      }

      // Stringify a unist node representation of a file (in string or vfile
      // representation) into a string using the `Compiler` on the processor.
      function stringify(node, doc) {
        var file = vfile(doc);
        var Compiler;

        freeze();
        Compiler = processor.Compiler;
        assertCompiler('stringify', Compiler);
        assertNode(node);

        if (newable(Compiler, 'compile')) {
          return new Compiler(node, file).compile()
        }

        return Compiler(node, file) // eslint-disable-line new-cap
      }

      // Parse a file (in string or vfile representation) into a unist node using
      // the `Parser` on the processor, then run transforms on that node, and
      // compile the resulting node using the `Compiler` on the processor, and
      // store that result on the vfile.
      function process(doc, cb) {
        freeze();
        assertParser('process', processor.Parser);
        assertCompiler('process', processor.Compiler);

        if (!cb) {
          return new Promise(executor)
        }

        executor(null, cb);

        function executor(resolve, reject) {
          var file = vfile(doc);

          pipeline.run(processor, {file: file}, done);

          function done(err) {
            if (err) {
              reject(err);
            } else if (resolve) {
              resolve(file);
            } else {
              cb(null, file);
            }
          }
        }
      }

      // Process the given document (in string or vfile representation), sync.
      function processSync(doc) {
        var complete = false;
        var file;

        freeze();
        assertParser('processSync', processor.Parser);
        assertCompiler('processSync', processor.Compiler);
        file = vfile(doc);

        process(file, done);

        assertDone('processSync', 'process', complete);

        return file

        function done(err) {
          complete = true;
          bail_1(err);
        }
      }
    }

    // Check if `value` is a constructor.
    function newable(value, name) {
      return (
        typeof value === 'function' &&
        value.prototype &&
        // A function with keys in its prototype is probably a constructor.
        // Classes’ prototype methods are not enumerable, so we check if some value
        // exists in the prototype.
        (keys(value.prototype) || name in value.prototype)
      )
    }

    // Check if `value` is an object with keys.
    function keys(value) {
      var key;
      for (key in value) {
        return true
      }

      return false
    }

    // Assert a parser is available.
    function assertParser(name, Parser) {
      if (typeof Parser !== 'function') {
        throw new Error('Cannot `' + name + '` without `Parser`')
      }
    }

    // Assert a compiler is available.
    function assertCompiler(name, Compiler) {
      if (typeof Compiler !== 'function') {
        throw new Error('Cannot `' + name + '` without `Compiler`')
      }
    }

    // Assert the processor is not frozen.
    function assertUnfrozen(name, frozen) {
      if (frozen) {
        throw new Error(
          'Cannot invoke `' +
            name +
            '` on a frozen processor.\nCreate a new processor first, by invoking it: use `processor()` instead of `processor`.'
        )
      }
    }

    // Assert `node` is a unist node.
    function assertNode(node) {
      if (!node || typeof node.type !== 'string') {
        throw new Error('Expected node, got `' + node + '`')
      }
    }

    // Assert that `complete` is `true`.
    function assertDone(name, asyncName, complete) {
      if (!complete) {
        throw new Error(
          '`' + name + '` finished async. Use `' + asyncName + '` instead'
        )
      }
    }

    var mdastUtilToString = toString$1;

    // Get the text content of a node.
    // Prefer the node’s plain-text fields, otherwise serialize its children,
    // and if the given value is an array, serialize the nodes in it.
    function toString$1(node) {
      return (
        (node &&
          (node.value ||
            node.alt ||
            node.title ||
            ('children' in node && all(node.children)) ||
            ('length' in node && all(node)))) ||
        ''
      )
    }

    function all(values) {
      var result = [];
      var index = -1;

      while (++index < values.length) {
        result[index] = toString$1(values[index]);
      }

      return result.join('')
    }

    var assign = Object.assign;

    var assign_1 = assign;

    var own$3 = {}.hasOwnProperty;

    var hasOwnProperty_1 = own$3;

    function normalizeIdentifier(value) {
      return (
        value // Collapse Markdown whitespace.
          .replace(/[\t\n\r ]+/g, ' ') // Trim.
          .replace(/^ | $/g, '') // Some characters are considered “uppercase”, but if their lowercase
          // counterpart is uppercased will result in a different uppercase
          // character.
          // Hence, to get that form, we perform both lower- and uppercase.
          // Upper case makes sure keys will not interact with default prototypal
          // methods: no object method is uppercase.
          .toLowerCase()
          .toUpperCase()
      )
    }

    var normalizeIdentifier_1 = normalizeIdentifier;

    var fromCharCode = String.fromCharCode;

    var fromCharCode_1 = fromCharCode;

    function safeFromInt(value, base) {
      var code = parseInt(value, base);

      if (
        // C0 except for HT, LF, FF, CR, space
        code < 9 ||
        code === 11 ||
        (code > 13 && code < 32) || // Control character (DEL) of the basic block and C1 controls.
        (code > 126 && code < 160) || // Lone high surrogates and low surrogates.
        (code > 55295 && code < 57344) || // Noncharacters.
        (code > 64975 && code < 65008) ||
        (code & 65535) === 65535 ||
        (code & 65535) === 65534 || // Out of range
        code > 1114111
      ) {
        return '\uFFFD'
      }

      return fromCharCode_1(code)
    }

    var safeFromInt_1 = safeFromInt;

    function miniflat(value) {
      return value === null || value === undefined
        ? []
        : 'length' in value
        ? value
        : [value]
    }

    var miniflat_1 = miniflat;

    function createCommonjsModule(fn, basedir, module) {
    	return module = {
    		path: basedir,
    		exports: {},
    		require: function (path, base) {
    			return commonjsRequire(path, (base === undefined || base === null) ? module.path : base);
    		}
    	}, fn(module, module.exports), module.exports;
    }

    function commonjsRequire () {
    	throw new Error('Dynamic requires are not currently supported by @rollup/plugin-commonjs');
    }

    function markdownLineEnding(code) {
      return code < -2
    }

    var markdownLineEnding_1 = markdownLineEnding;

    function markdownSpace(code) {
      return code === -2 || code === -1 || code === 32
    }

    var markdownSpace_1 = markdownSpace;

    function spaceFactory(effects, ok, type, max) {
      var limit = max ? max - 1 : Infinity;
      var size = 0;
      return start

      function start(code) {
        if (markdownSpace_1(code)) {
          effects.enter(type);
          return prefix(code)
        }

        return ok(code)
      }

      function prefix(code) {
        if (markdownSpace_1(code) && size++ < limit) {
          effects.consume(code);
          return prefix
        }

        effects.exit(type);
        return ok(code)
      }
    }

    var factorySpace = spaceFactory;

    var content = createCommonjsModule(function (module, exports) {

    Object.defineProperty(exports, '__esModule', {value: true});




    var tokenize = initializeContent;

    function initializeContent(effects) {
      var contentStart = effects.attempt(
        this.parser.constructs.contentInitial,
        afterContentStartConstruct,
        paragraphInitial
      );
      var previous;
      return contentStart

      function afterContentStartConstruct(code) {
        if (code === null) {
          effects.consume(code);
          return
        }

        effects.enter('lineEnding');
        effects.consume(code);
        effects.exit('lineEnding');
        return factorySpace(effects, contentStart, 'linePrefix')
      }

      function paragraphInitial(code) {
        effects.enter('paragraph');
        return lineStart(code)
      }

      function lineStart(code) {
        var token = effects.enter('chunkText', {
          contentType: 'text',
          previous: previous
        });

        if (previous) {
          previous.next = token;
        }

        previous = token;
        return data(code)
      }

      function data(code) {
        if (code === null) {
          effects.exit('chunkText');
          effects.exit('paragraph');
          effects.consume(code);
          return
        }

        if (markdownLineEnding_1(code)) {
          effects.consume(code);
          effects.exit('chunkText');
          return lineStart
        } // Data.

        effects.consume(code);
        return data
      }
    }

    exports.tokenize = tokenize;
    });

    var partialBlankLine = {
      tokenize: tokenizePartialBlankLine,
      partial: true
    };

    function tokenizePartialBlankLine(effects, ok, nok) {
      return factorySpace(effects, afterWhitespace, 'linePrefix')

      function afterWhitespace(code) {
        return code === null || markdownLineEnding_1(code) ? ok(code) : nok(code)
      }
    }

    var partialBlankLine_1 = partialBlankLine;

    var document$1 = createCommonjsModule(function (module, exports) {

    Object.defineProperty(exports, '__esModule', {value: true});





    var tokenize = initializeDocument;
    var containerConstruct = {
      tokenize: tokenizeContainer
    };
    var lazyFlowConstruct = {
      tokenize: tokenizeLazyFlow
    };

    function initializeDocument(effects) {
      var self = this;
      var stack = [];
      var continued = 0;
      var inspectConstruct = {
        tokenize: tokenizeInspect,
        partial: true
      };
      var inspectResult;
      var childFlow;
      var childToken;
      return start

      function start(code) {
        if (continued < stack.length) {
          self.containerState = stack[continued][1];
          return effects.attempt(
            stack[continued][0].continuation,
            documentContinue,
            documentContinued
          )(code)
        }

        return documentContinued(code)
      }

      function documentContinue(code) {
        continued++;
        return start(code)
      }

      function documentContinued(code) {
        // If we’re in a concrete construct (such as when expecting another line of
        // HTML, or we resulted in lazy content), we can immediately start flow.
        if (inspectResult && inspectResult.flowContinue) {
          return flowStart(code)
        }

        self.interrupt =
          childFlow &&
          childFlow.currentConstruct &&
          childFlow.currentConstruct.interruptible;
        self.containerState = {};
        return effects.attempt(
          containerConstruct,
          containerContinue,
          flowStart
        )(code)
      }

      function containerContinue(code) {
        stack.push([self.currentConstruct, self.containerState]);
        self.containerState = undefined;
        return documentContinued(code)
      }

      function flowStart(code) {
        if (code === null) {
          exitContainers(0, true);
          effects.consume(code);
          return
        }

        childFlow = childFlow || self.parser.flow(self.now());
        effects.enter('chunkFlow', {
          contentType: 'flow',
          previous: childToken,
          _tokenizer: childFlow
        });
        return flowContinue(code)
      }

      function flowContinue(code) {
        if (code === null) {
          continueFlow(effects.exit('chunkFlow'));
          return flowStart(code)
        }

        if (markdownLineEnding_1(code)) {
          effects.consume(code);
          continueFlow(effects.exit('chunkFlow'));
          return effects.check(inspectConstruct, documentAfterPeek)
        }

        effects.consume(code);
        return flowContinue
      }

      function documentAfterPeek(code) {
        exitContainers(
          inspectResult.continued,
          inspectResult && inspectResult.flowEnd
        );
        continued = 0;
        return start(code)
      }

      function continueFlow(token) {
        if (childToken) childToken.next = token;
        childToken = token;
        childFlow.lazy = inspectResult && inspectResult.lazy;
        childFlow.defineSkip(token.start);
        childFlow.write(self.sliceStream(token));
      }

      function exitContainers(size, end) {
        var index = stack.length; // Close the flow.

        if (childFlow && end) {
          childFlow.write([null]);
          childToken = childFlow = undefined;
        } // Exit open containers.

        while (index-- > size) {
          self.containerState = stack[index][1];
          stack[index][0].exit.call(self, effects);
        }

        stack.length = size;
      }

      function tokenizeInspect(effects, ok) {
        var subcontinued = 0;
        inspectResult = {};
        return inspectStart

        function inspectStart(code) {
          if (subcontinued < stack.length) {
            self.containerState = stack[subcontinued][1];
            return effects.attempt(
              stack[subcontinued][0].continuation,
              inspectContinue,
              inspectLess
            )(code)
          } // If we’re continued but in a concrete flow, we can’t have more
          // containers.

          if (childFlow.currentConstruct && childFlow.currentConstruct.concrete) {
            inspectResult.flowContinue = true;
            return inspectDone(code)
          }

          self.interrupt =
            childFlow.currentConstruct && childFlow.currentConstruct.interruptible;
          self.containerState = {};
          return effects.attempt(
            containerConstruct,
            inspectFlowEnd,
            inspectDone
          )(code)
        }

        function inspectContinue(code) {
          subcontinued++;
          return self.containerState._closeFlow
            ? inspectFlowEnd(code)
            : inspectStart(code)
        }

        function inspectLess(code) {
          if (childFlow.currentConstruct && childFlow.currentConstruct.lazy) {
            // Maybe another container?
            self.containerState = {};
            return effects.attempt(
              containerConstruct,
              inspectFlowEnd, // Maybe flow, or a blank line?
              effects.attempt(
                lazyFlowConstruct,
                inspectFlowEnd,
                effects.check(partialBlankLine_1, inspectFlowEnd, inspectLazy)
              )
            )(code)
          } // Otherwise we’re interrupting.

          return inspectFlowEnd(code)
        }

        function inspectLazy(code) {
          // Act as if all containers are continued.
          subcontinued = stack.length;
          inspectResult.lazy = true;
          inspectResult.flowContinue = true;
          return inspectDone(code)
        } // We’re done with flow if we have more containers, or an interruption.

        function inspectFlowEnd(code) {
          inspectResult.flowEnd = true;
          return inspectDone(code)
        }

        function inspectDone(code) {
          inspectResult.continued = subcontinued;
          self.interrupt = self.containerState = undefined;
          return ok(code)
        }
      }
    }

    function tokenizeContainer(effects, ok, nok) {
      return factorySpace(
        effects,
        effects.attempt(this.parser.constructs.document, ok, nok),
        'linePrefix',
        this.parser.constructs.disable.null.indexOf('codeIndented') > -1
          ? undefined
          : 4
      )
    }

    function tokenizeLazyFlow(effects, ok, nok) {
      return factorySpace(
        effects,
        effects.lazy(this.parser.constructs.flow, ok, nok),
        'linePrefix',
        this.parser.constructs.disable.null.indexOf('codeIndented') > -1
          ? undefined
          : 4
      )
    }

    exports.tokenize = tokenize;
    });

    // Counts tabs based on their expanded size, and CR+LF as one character.

    function sizeChunks(chunks) {
      var index = -1;
      var size = 0;

      while (++index < chunks.length) {
        size += typeof chunks[index] === 'string' ? chunks[index].length : 1;
      }

      return size
    }

    var sizeChunks_1 = sizeChunks;

    function prefixSize(events, type) {
      var tail = events[events.length - 1];
      if (!tail || tail[1].type !== type) return 0
      return sizeChunks_1(tail[2].sliceStream(tail[1]))
    }

    var prefixSize_1 = prefixSize;

    var splice = [].splice;

    var splice_1 = splice;

    // causes a stack overflow in V8 when trying to insert 100k items for instance.

    function chunkedSplice(list, start, remove, items) {
      var end = list.length;
      var chunkStart = 0;
      var parameters; // Make start between zero and `end` (included).

      if (start < 0) {
        start = -start > end ? 0 : end + start;
      } else {
        start = start > end ? end : start;
      }

      remove = remove > 0 ? remove : 0; // No need to chunk the items if there’s only a couple (10k) items.

      if (items.length < 10000) {
        parameters = Array.from(items);
        parameters.unshift(start, remove);
        splice_1.apply(list, parameters);
      } else {
        // Delete `remove` items starting from `start`
        if (remove) splice_1.apply(list, [start, remove]); // Insert the items in chunks to not cause stack overflows.

        while (chunkStart < items.length) {
          parameters = items.slice(chunkStart, chunkStart + 10000);
          parameters.unshift(start, 0);
          splice_1.apply(list, parameters);
          chunkStart += 10000;
          start += 10000;
        }
      }
    }

    var chunkedSplice_1 = chunkedSplice;

    function shallow(object) {
      return assign_1({}, object)
    }

    var shallow_1 = shallow;

    function subtokenize(events) {
      var jumps = {};
      var index = -1;
      var event;
      var lineIndex;
      var otherIndex;
      var otherEvent;
      var parameters;
      var subevents;
      var more;

      while (++index < events.length) {
        while (index in jumps) {
          index = jumps[index];
        }

        event = events[index]; // Add a hook for the GFM tasklist extension, which needs to know if text
        // is in the first content of a list item.

        if (
          index &&
          event[1].type === 'chunkFlow' &&
          events[index - 1][1].type === 'listItemPrefix'
        ) {
          subevents = event[1]._tokenizer.events;
          otherIndex = 0;

          if (
            otherIndex < subevents.length &&
            subevents[otherIndex][1].type === 'lineEndingBlank'
          ) {
            otherIndex += 2;
          }

          if (
            otherIndex < subevents.length &&
            subevents[otherIndex][1].type === 'content'
          ) {
            while (++otherIndex < subevents.length) {
              if (subevents[otherIndex][1].type === 'content') {
                break
              }

              if (subevents[otherIndex][1].type === 'chunkText') {
                subevents[otherIndex][1].isInFirstContentOfListItem = true;
                otherIndex++;
              }
            }
          }
        } // Enter.

        if (event[0] === 'enter') {
          if (event[1].contentType) {
            assign_1(jumps, subcontent(events, index));
            index = jumps[index];
            more = true;
          }
        } // Exit.
        else if (event[1]._container || event[1]._movePreviousLineEndings) {
          otherIndex = index;
          lineIndex = undefined;

          while (otherIndex--) {
            otherEvent = events[otherIndex];

            if (
              otherEvent[1].type === 'lineEnding' ||
              otherEvent[1].type === 'lineEndingBlank'
            ) {
              if (otherEvent[0] === 'enter') {
                if (lineIndex) {
                  events[lineIndex][1].type = 'lineEndingBlank';
                }

                otherEvent[1].type = 'lineEnding';
                lineIndex = otherIndex;
              }
            } else {
              break
            }
          }

          if (lineIndex) {
            // Fix position.
            event[1].end = shallow_1(events[lineIndex][1].start); // Switch container exit w/ line endings.

            parameters = events.slice(lineIndex, index);
            parameters.unshift(event);
            chunkedSplice_1(events, lineIndex, index - lineIndex + 1, parameters);
          }
        }
      }

      return !more
    }

    function subcontent(events, eventIndex) {
      var token = events[eventIndex][1];
      var context = events[eventIndex][2];
      var startPosition = eventIndex - 1;
      var startPositions = [];
      var tokenizer =
        token._tokenizer || context.parser[token.contentType](token.start);
      var childEvents = tokenizer.events;
      var jumps = [];
      var gaps = {};
      var stream;
      var previous;
      var index;
      var entered;
      var end;
      var adjust; // Loop forward through the linked tokens to pass them in order to the
      // subtokenizer.

      while (token) {
        // Find the position of the event for this token.
        while (events[++startPosition][1] !== token) {
          // Empty.
        }

        startPositions.push(startPosition);

        if (!token._tokenizer) {
          stream = context.sliceStream(token);

          if (!token.next) {
            stream.push(null);
          }

          if (previous) {
            tokenizer.defineSkip(token.start);
          }

          if (token.isInFirstContentOfListItem) {
            tokenizer._gfmTasklistFirstContentOfListItem = true;
          }

          tokenizer.write(stream);

          if (token.isInFirstContentOfListItem) {
            tokenizer._gfmTasklistFirstContentOfListItem = undefined;
          }
        } // Unravel the next token.

        previous = token;
        token = token.next;
      } // Now, loop back through all events (and linked tokens), to figure out which
      // parts belong where.

      token = previous;
      index = childEvents.length;

      while (index--) {
        // Make sure we’ve at least seen something (final eol is part of the last
        // token).
        if (childEvents[index][0] === 'enter') {
          entered = true;
        } else if (
          // Find a void token that includes a break.
          entered &&
          childEvents[index][1].type === childEvents[index - 1][1].type &&
          childEvents[index][1].start.line !== childEvents[index][1].end.line
        ) {
          add(childEvents.slice(index + 1, end));
          // Help GC.
          token._tokenizer = token.next = undefined;
          token = token.previous;
          end = index + 1;
        }
      }

      // Help GC.
      tokenizer.events = token._tokenizer = token.next = undefined; // Do head:

      add(childEvents.slice(0, end));
      index = -1;
      adjust = 0;

      while (++index < jumps.length) {
        gaps[adjust + jumps[index][0]] = adjust + jumps[index][1];
        adjust += jumps[index][1] - jumps[index][0] - 1;
      }

      return gaps

      function add(slice) {
        var start = startPositions.pop();
        jumps.unshift([start, start + slice.length - 1]);
        chunkedSplice_1(events, start, 2, slice);
      }
    }

    var subtokenize_1 = subtokenize;

    // No name because it must not be turned off.
    var content$1 = {
      tokenize: tokenizeContent,
      resolve: resolveContent,
      interruptible: true,
      lazy: true
    };
    var continuationConstruct = {
      tokenize: tokenizeContinuation,
      partial: true
    }; // Content is transparent: it’s parsed right now. That way, definitions are also
    // parsed right now: before text in paragraphs (specifically, media) are parsed.

    function resolveContent(events) {
      subtokenize_1(events);
      return events
    }

    function tokenizeContent(effects, ok) {
      var previous;
      return start

      function start(code) {
        effects.enter('content');
        previous = effects.enter('chunkContent', {
          contentType: 'content'
        });
        return data(code)
      }

      function data(code) {
        if (code === null) {
          return contentEnd(code)
        }

        if (markdownLineEnding_1(code)) {
          return effects.check(
            continuationConstruct,
            contentContinue,
            contentEnd
          )(code)
        } // Data.

        effects.consume(code);
        return data
      }

      function contentEnd(code) {
        effects.exit('chunkContent');
        effects.exit('content');
        return ok(code)
      }

      function contentContinue(code) {
        effects.consume(code);
        effects.exit('chunkContent');
        previous = previous.next = effects.enter('chunkContent', {
          contentType: 'content',
          previous: previous
        });
        return data
      }
    }

    function tokenizeContinuation(effects, ok, nok) {
      var self = this;
      return startLookahead

      function startLookahead(code) {
        effects.enter('lineEnding');
        effects.consume(code);
        effects.exit('lineEnding');
        return factorySpace(effects, prefixed, 'linePrefix')
      }

      function prefixed(code) {
        if (code === null || markdownLineEnding_1(code)) {
          return nok(code)
        }

        if (
          self.parser.constructs.disable.null.indexOf('codeIndented') > -1 ||
          prefixSize_1(self.events, 'linePrefix') < 4
        ) {
          return effects.interrupt(self.parser.constructs.flow, nok, ok)(code)
        }

        return ok(code)
      }
    }

    var content_1 = content$1;

    var flow = createCommonjsModule(function (module, exports) {

    Object.defineProperty(exports, '__esModule', {value: true});





    var tokenize = initializeFlow;

    function initializeFlow(effects) {
      var self = this;
      var initial = effects.attempt(
        // Try to parse a blank line.
        partialBlankLine_1,
        atBlankEnding, // Try to parse initial flow (essentially, only code).
        effects.attempt(
          this.parser.constructs.flowInitial,
          afterConstruct,
          factorySpace(
            effects,
            effects.attempt(
              this.parser.constructs.flow,
              afterConstruct,
              effects.attempt(content_1, afterConstruct)
            ),
            'linePrefix'
          )
        )
      );
      return initial

      function atBlankEnding(code) {
        if (code === null) {
          effects.consume(code);
          return
        }

        effects.enter('lineEndingBlank');
        effects.consume(code);
        effects.exit('lineEndingBlank');
        self.currentConstruct = undefined;
        return initial
      }

      function afterConstruct(code) {
        if (code === null) {
          effects.consume(code);
          return
        }

        effects.enter('lineEnding');
        effects.consume(code);
        effects.exit('lineEnding');
        self.currentConstruct = undefined;
        return initial
      }
    }

    exports.tokenize = tokenize;
    });

    var text_1 = createCommonjsModule(function (module, exports) {

    Object.defineProperty(exports, '__esModule', {value: true});




    var text = initializeFactory('text');
    var string = initializeFactory('string');
    var resolver = {
      resolveAll: createResolver()
    };

    function initializeFactory(field) {
      return {
        tokenize: initializeText,
        resolveAll: createResolver(
          field === 'text' ? resolveAllLineSuffixes : undefined
        )
      }

      function initializeText(effects) {
        var self = this;
        var constructs = this.parser.constructs[field];
        var text = effects.attempt(constructs, start, notText);
        return start

        function start(code) {
          return atBreak(code) ? text(code) : notText(code)
        }

        function notText(code) {
          if (code === null) {
            effects.consume(code);
            return
          }

          effects.enter('data');
          effects.consume(code);
          return data
        }

        function data(code) {
          if (atBreak(code)) {
            effects.exit('data');
            return text(code)
          } // Data.

          effects.consume(code);
          return data
        }

        function atBreak(code) {
          var list = constructs[code];
          var index = -1;

          if (code === null) {
            return true
          }

          if (list) {
            while (++index < list.length) {
              if (
                !list[index].previous ||
                list[index].previous.call(self, self.previous)
              ) {
                return true
              }
            }
          }
        }
      }
    }

    function createResolver(extraResolver) {
      return resolveAllText

      function resolveAllText(events, context) {
        var index = -1;
        var enter; // A rather boring computation (to merge adjacent `data` events) which
        // improves mm performance by 29%.

        while (++index <= events.length) {
          if (enter === undefined) {
            if (events[index] && events[index][1].type === 'data') {
              enter = index;
              index++;
            }
          } else if (!events[index] || events[index][1].type !== 'data') {
            // Don’t do anything if there is one data token.
            if (index !== enter + 2) {
              events[enter][1].end = events[index - 1][1].end;
              events.splice(enter + 2, index - enter - 2);
              index = enter + 2;
            }

            enter = undefined;
          }
        }

        return extraResolver ? extraResolver(events, context) : events
      }
    } // A rather ugly set of instructions which again looks at chunks in the input
    // stream.
    // The reason to do this here is that it is *much* faster to parse in reverse.
    // And that we can’t hook into `null` to split the line suffix before an EOF.
    // To do: figure out if we can make this into a clean utility, or even in core.
    // As it will be useful for GFMs literal autolink extension (and maybe even
    // tables?)

    function resolveAllLineSuffixes(events, context) {
      var eventIndex = -1;
      var chunks;
      var data;
      var chunk;
      var index;
      var bufferIndex;
      var size;
      var tabs;
      var token;

      while (++eventIndex <= events.length) {
        if (
          (eventIndex === events.length ||
            events[eventIndex][1].type === 'lineEnding') &&
          events[eventIndex - 1][1].type === 'data'
        ) {
          data = events[eventIndex - 1][1];
          chunks = context.sliceStream(data);
          index = chunks.length;
          bufferIndex = -1;
          size = 0;
          tabs = undefined;

          while (index--) {
            chunk = chunks[index];

            if (typeof chunk === 'string') {
              bufferIndex = chunk.length;

              while (chunk.charCodeAt(bufferIndex - 1) === 32) {
                size++;
                bufferIndex--;
              }

              if (bufferIndex) break
              bufferIndex = -1;
            } // Number
            else if (chunk === -2) {
              tabs = true;
              size++;
            } else if (chunk === -1);
            else {
              // Replacement character, exit.
              index++;
              break
            }
          }

          if (size) {
            token = {
              type:
                eventIndex === events.length || tabs || size < 2
                  ? 'lineSuffix'
                  : 'hardBreakTrailing',
              start: {
                line: data.end.line,
                column: data.end.column - size,
                offset: data.end.offset - size,
                _index: data.start._index + index,
                _bufferIndex: index
                  ? bufferIndex
                  : data.start._bufferIndex + bufferIndex
              },
              end: shallow_1(data.end)
            };
            data.end = shallow_1(token.start);

            if (data.start.offset === data.end.offset) {
              assign_1(data, token);
            } else {
              events.splice(
                eventIndex,
                0,
                ['enter', token, context],
                ['exit', token, context]
              );
              eventIndex += 2;
            }
          }

          eventIndex++;
        }
      }

      return events
    }

    exports.resolver = resolver;
    exports.string = string;
    exports.text = text;
    });

    function combineExtensions(extensions) {
      var all = {};
      var index = -1;

      while (++index < extensions.length) {
        extension(all, extensions[index]);
      }

      return all
    }

    function extension(all, extension) {
      var hook;
      var left;
      var right;
      var code;

      for (hook in extension) {
        left = hasOwnProperty_1.call(all, hook) ? all[hook] : (all[hook] = {});
        right = extension[hook];

        for (code in right) {
          left[code] = constructs(
            miniflat_1(right[code]),
            hasOwnProperty_1.call(left, code) ? left[code] : []
          );
        }
      }
    }

    function constructs(list, existing) {
      var index = -1;
      var before = [];

      while (++index < list.length) {
    (list[index].add === 'after' ? existing : before).push(list[index]);
      }

      chunkedSplice_1(existing, 0, 0, before);
      return existing
    }

    var combineExtensions_1 = combineExtensions;

    function chunkedPush(list, items) {
      if (list.length) {
        chunkedSplice_1(list, list.length, 0, items);
        return list
      }

      return items
    }

    var chunkedPush_1 = chunkedPush;

    function resolveAll(constructs, events, context) {
      var called = [];
      var index = -1;
      var resolve;

      while (++index < constructs.length) {
        resolve = constructs[index].resolveAll;

        if (resolve && called.indexOf(resolve) < 0) {
          events = resolve(events, context);
          called.push(resolve);
        }
      }

      return events
    }

    var resolveAll_1 = resolveAll;

    function serializeChunks(chunks) {
      var index = -1;
      var result = [];
      var chunk;
      var value;
      var atTab;

      while (++index < chunks.length) {
        chunk = chunks[index];

        if (typeof chunk === 'string') {
          value = chunk;
        } else if (chunk === -5) {
          value = '\r';
        } else if (chunk === -4) {
          value = '\n';
        } else if (chunk === -3) {
          value = '\r' + '\n';
        } else if (chunk === -2) {
          value = '\t';
        } else if (chunk === -1) {
          if (atTab) continue
          value = ' ';
        } else {
          // Currently only replacement character.
          value = fromCharCode_1(chunk);
        }

        atTab = chunk === -2;
        result.push(value);
      }

      return result.join('')
    }

    var serializeChunks_1 = serializeChunks;

    function sliceChunks(chunks, token) {
      var startIndex = token.start._index;
      var startBufferIndex = token.start._bufferIndex;
      var endIndex = token.end._index;
      var endBufferIndex = token.end._bufferIndex;
      var view;

      if (startIndex === endIndex) {
        view = [chunks[startIndex].slice(startBufferIndex, endBufferIndex)];
      } else {
        view = chunks.slice(startIndex, endIndex);

        if (startBufferIndex > -1) {
          view[0] = view[0].slice(startBufferIndex);
        }

        if (endBufferIndex > 0) {
          view.push(chunks[endIndex].slice(0, endBufferIndex));
        }
      }

      return view
    }

    var sliceChunks_1 = sliceChunks;

    // Create a tokenizer.
    // Tokenizers deal with one type of data (e.g., containers, flow, text).
    // The parser is the object dealing with it all.
    // `initialize` works like other constructs, except that only its `tokenize`
    // function is used, in which case it doesn’t receive an `ok` or `nok`.
    // `from` can be given to set the point before the first character, although
    // when further lines are indented, they must be set with `defineSkip`.
    function createTokenizer(parser, initialize, from) {
      var point = from
        ? shallow_1(from)
        : {
            line: 1,
            column: 1,
            offset: 0
          };
      var columnStart = {};
      var resolveAllConstructs = [];
      var chunks = [];
      var stack = [];

      var effects = {
        consume: consume,
        enter: enter,
        exit: exit,
        attempt: constructFactory(onsuccessfulconstruct),
        check: constructFactory(onsuccessfulcheck),
        interrupt: constructFactory(onsuccessfulcheck, {
          interrupt: true
        }),
        lazy: constructFactory(onsuccessfulcheck, {
          lazy: true
        })
      }; // State and tools for resolving and serializing.

      var context = {
        previous: null,
        events: [],
        parser: parser,
        sliceStream: sliceStream,
        sliceSerialize: sliceSerialize,
        now: now,
        defineSkip: skip,
        write: write
      }; // The state function.

      var state = initialize.tokenize.call(context, effects); // Track which character we expect to be consumed, to catch bugs.

      if (initialize.resolveAll) {
        resolveAllConstructs.push(initialize);
      } // Store where we are in the input stream.

      point._index = 0;
      point._bufferIndex = -1;
      return context

      function write(slice) {
        chunks = chunkedPush_1(chunks, slice);
        main(); // Exit if we’re not done, resolve might change stuff.

        if (chunks[chunks.length - 1] !== null) {
          return []
        }

        addResult(initialize, 0); // Otherwise, resolve, and exit.

        context.events = resolveAll_1(resolveAllConstructs, context.events, context);
        return context.events
      } //
      // Tools.
      //

      function sliceSerialize(token) {
        return serializeChunks_1(sliceStream(token))
      }

      function sliceStream(token) {
        return sliceChunks_1(chunks, token)
      }

      function now() {
        return shallow_1(point)
      }

      function skip(value) {
        columnStart[value.line] = value.column;
        accountForPotentialSkip();
      } //
      // State management.
      //
      // Main loop (note that `_index` and `_bufferIndex` in `point` are modified by
      // `consume`).
      // Here is where we walk through the chunks, which either include strings of
      // several characters, or numerical character codes.
      // The reason to do this in a loop instead of a call is so the stack can
      // drain.

      function main() {
        var chunkIndex;
        var chunk;

        while (point._index < chunks.length) {
          chunk = chunks[point._index]; // If we’re in a buffer chunk, loop through it.

          if (typeof chunk === 'string') {
            chunkIndex = point._index;

            if (point._bufferIndex < 0) {
              point._bufferIndex = 0;
            }

            while (
              point._index === chunkIndex &&
              point._bufferIndex < chunk.length
            ) {
              go(chunk.charCodeAt(point._bufferIndex));
            }
          } else {
            go(chunk);
          }
        }
      } // Deal with one code.

      function go(code) {
        state = state(code);
      } // Move a character forward.

      function consume(code) {
        if (markdownLineEnding_1(code)) {
          point.line++;
          point.column = 1;
          point.offset += code === -3 ? 2 : 1;
          accountForPotentialSkip();
        } else if (code !== -1) {
          point.column++;
          point.offset++;
        } // Not in a string chunk.

        if (point._bufferIndex < 0) {
          point._index++;
        } else {
          point._bufferIndex++; // At end of string chunk.

          if (point._bufferIndex === chunks[point._index].length) {
            point._bufferIndex = -1;
            point._index++;
          }
        } // Expose the previous character.

        context.previous = code; // Mark as consumed.
      } // Start a token.

      function enter(type, fields) {
        var token = fields || {};
        token.type = type;
        token.start = now();
        context.events.push(['enter', token, context]);
        stack.push(token);
        return token
      } // Stop a token.

      function exit(type) {
        var token = stack.pop();
        token.end = now();
        context.events.push(['exit', token, context]);
        return token
      } // Use results.

      function onsuccessfulconstruct(construct, info) {
        addResult(construct, info.from);
      } // Discard results.

      function onsuccessfulcheck(construct, info) {
        info.restore();
      } // Factory to attempt/check/interrupt.

      function constructFactory(onreturn, fields) {
        return hook // Handle either an object mapping codes to constructs, a list of
        // constructs, or a single construct.

        function hook(constructs, returnState, bogusState) {
          var listOfConstructs;
          var constructIndex;
          var currentConstruct;
          var info;
          return constructs.tokenize || 'length' in constructs
            ? handleListOfConstructs(miniflat_1(constructs))
            : handleMapOfConstructs

          function handleMapOfConstructs(code) {
            if (code in constructs || null in constructs) {
              return handleListOfConstructs(
                constructs.null
                  ? /* c8 ignore next */
                    miniflat_1(constructs[code]).concat(miniflat_1(constructs.null))
                  : constructs[code]
              )(code)
            }

            return bogusState(code)
          }

          function handleListOfConstructs(list) {
            listOfConstructs = list;
            constructIndex = 0;
            return handleConstruct(list[constructIndex])
          }

          function handleConstruct(construct) {
            return start

            function start(code) {
              // To do: not nede to store if there is no bogus state, probably?
              // Currently doesn’t work because `inspect` in document does a check
              // w/o a bogus, which doesn’t make sense. But it does seem to help perf
              // by not storing.
              info = store();
              currentConstruct = construct;

              if (!construct.partial) {
                context.currentConstruct = construct;
              }

              if (
                construct.name &&
                context.parser.constructs.disable.null.indexOf(construct.name) > -1
              ) {
                return nok()
              }

              return construct.tokenize.call(
                fields ? assign_1({}, context, fields) : context,
                effects,
                ok,
                nok
              )(code)
            }
          }

          function ok(code) {
            onreturn(currentConstruct, info);
            return returnState
          }

          function nok(code) {
            info.restore();

            if (++constructIndex < listOfConstructs.length) {
              return handleConstruct(listOfConstructs[constructIndex])
            }

            return bogusState
          }
        }
      }

      function addResult(construct, from) {
        if (construct.resolveAll && resolveAllConstructs.indexOf(construct) < 0) {
          resolveAllConstructs.push(construct);
        }

        if (construct.resolve) {
          chunkedSplice_1(
            context.events,
            from,
            context.events.length - from,
            construct.resolve(context.events.slice(from), context)
          );
        }

        if (construct.resolveTo) {
          context.events = construct.resolveTo(context.events, context);
        }
      }

      function store() {
        var startPoint = now();
        var startPrevious = context.previous;
        var startCurrentConstruct = context.currentConstruct;
        var startEventsIndex = context.events.length;
        var startStack = Array.from(stack);
        return {
          restore: restore,
          from: startEventsIndex
        }

        function restore() {
          point = startPoint;
          context.previous = startPrevious;
          context.currentConstruct = startCurrentConstruct;
          context.events.length = startEventsIndex;
          stack = startStack;
          accountForPotentialSkip();
        }
      }

      function accountForPotentialSkip() {
        if (point.line in columnStart && point.column < 2) {
          point.column = columnStart[point.line];
          point.offset += columnStart[point.line] - 1;
        }
      }
    }

    var createTokenizer_1 = createTokenizer;

    function markdownLineEndingOrSpace(code) {
      return code < 0 || code === 32
    }

    var markdownLineEndingOrSpace_1 = markdownLineEndingOrSpace;

    function regexCheck(regex) {
      return check

      function check(code) {
        return regex.test(fromCharCode_1(code))
      }
    }

    var regexCheck_1 = regexCheck;

    // This module is generated by `script/`.
    //
    // CommonMark handles attention (emphasis, strong) markers based on what comes
    // before or after them.
    // One such difference is if those characters are Unicode punctuation.
    // This script is generated from the Unicode data.
    var unicodePunctuation = /[!-\/:-@\[-`\{-~\xA1\xA7\xAB\xB6\xB7\xBB\xBF\u037E\u0387\u055A-\u055F\u0589\u058A\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4\u0609\u060A\u060C\u060D\u061B\u061E\u061F\u066A-\u066D\u06D4\u0700-\u070D\u07F7-\u07F9\u0830-\u083E\u085E\u0964\u0965\u0970\u09FD\u0A76\u0AF0\u0C77\u0C84\u0DF4\u0E4F\u0E5A\u0E5B\u0F04-\u0F12\u0F14\u0F3A-\u0F3D\u0F85\u0FD0-\u0FD4\u0FD9\u0FDA\u104A-\u104F\u10FB\u1360-\u1368\u1400\u166E\u169B\u169C\u16EB-\u16ED\u1735\u1736\u17D4-\u17D6\u17D8-\u17DA\u1800-\u180A\u1944\u1945\u1A1E\u1A1F\u1AA0-\u1AA6\u1AA8-\u1AAD\u1B5A-\u1B60\u1BFC-\u1BFF\u1C3B-\u1C3F\u1C7E\u1C7F\u1CC0-\u1CC7\u1CD3\u2010-\u2027\u2030-\u2043\u2045-\u2051\u2053-\u205E\u207D\u207E\u208D\u208E\u2308-\u230B\u2329\u232A\u2768-\u2775\u27C5\u27C6\u27E6-\u27EF\u2983-\u2998\u29D8-\u29DB\u29FC\u29FD\u2CF9-\u2CFC\u2CFE\u2CFF\u2D70\u2E00-\u2E2E\u2E30-\u2E4F\u2E52\u3001-\u3003\u3008-\u3011\u3014-\u301F\u3030\u303D\u30A0\u30FB\uA4FE\uA4FF\uA60D-\uA60F\uA673\uA67E\uA6F2-\uA6F7\uA874-\uA877\uA8CE\uA8CF\uA8F8-\uA8FA\uA8FC\uA92E\uA92F\uA95F\uA9C1-\uA9CD\uA9DE\uA9DF\uAA5C-\uAA5F\uAADE\uAADF\uAAF0\uAAF1\uABEB\uFD3E\uFD3F\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE61\uFE63\uFE68\uFE6A\uFE6B\uFF01-\uFF03\uFF05-\uFF0A\uFF0C-\uFF0F\uFF1A\uFF1B\uFF1F\uFF20\uFF3B-\uFF3D\uFF3F\uFF5B\uFF5D\uFF5F-\uFF65]/;

    var unicodePunctuationRegex = unicodePunctuation;

    // In fact adds to the bundle size.

    var unicodePunctuation$1 = regexCheck_1(unicodePunctuationRegex);

    var unicodePunctuation_1 = unicodePunctuation$1;

    var unicodeWhitespace = regexCheck_1(/\s/);

    var unicodeWhitespace_1 = unicodeWhitespace;

    // Classify whether a character is unicode whitespace, unicode punctuation, or
    // anything else.
    // Used for attention (emphasis, strong), whose sequences can open or close
    // based on the class of surrounding characters.
    function classifyCharacter(code) {
      if (
        code === null ||
        markdownLineEndingOrSpace_1(code) ||
        unicodeWhitespace_1(code)
      ) {
        return 1
      }

      if (unicodePunctuation_1(code)) {
        return 2
      }
    }

    var classifyCharacter_1 = classifyCharacter;

    // chunks (replacement characters, tabs, or line endings).

    function movePoint(point, offset) {
      point.column += offset;
      point.offset += offset;
      point._bufferIndex += offset;
      return point
    }

    var movePoint_1 = movePoint;

    var attention = {
      name: 'attention',
      tokenize: tokenizeAttention,
      resolveAll: resolveAllAttention
    };

    function resolveAllAttention(events, context) {
      var index = -1;
      var open;
      var group;
      var text;
      var openingSequence;
      var closingSequence;
      var use;
      var nextEvents;
      var offset; // Walk through all events.
      //
      // Note: performance of this is fine on an mb of normal markdown, but it’s
      // a bottleneck for malicious stuff.

      while (++index < events.length) {
        // Find a token that can close.
        if (
          events[index][0] === 'enter' &&
          events[index][1].type === 'attentionSequence' &&
          events[index][1]._close
        ) {
          open = index; // Now walk back to find an opener.

          while (open--) {
            // Find a token that can open the closer.
            if (
              events[open][0] === 'exit' &&
              events[open][1].type === 'attentionSequence' &&
              events[open][1]._open && // If the markers are the same:
              context.sliceSerialize(events[open][1]).charCodeAt(0) ===
                context.sliceSerialize(events[index][1]).charCodeAt(0)
            ) {
              // If the opening can close or the closing can open,
              // and the close size *is not* a multiple of three,
              // but the sum of the opening and closing size *is* multiple of three,
              // then don’t match.
              if (
                (events[open][1]._close || events[index][1]._open) &&
                (events[index][1].end.offset - events[index][1].start.offset) % 3 &&
                !(
                  (events[open][1].end.offset -
                    events[open][1].start.offset +
                    events[index][1].end.offset -
                    events[index][1].start.offset) %
                  3
                )
              ) {
                continue
              } // Number of markers to use from the sequence.

              use =
                events[open][1].end.offset - events[open][1].start.offset > 1 &&
                events[index][1].end.offset - events[index][1].start.offset > 1
                  ? 2
                  : 1;
              openingSequence = {
                type: use > 1 ? 'strongSequence' : 'emphasisSequence',
                start: movePoint_1(shallow_1(events[open][1].end), -use),
                end: shallow_1(events[open][1].end)
              };
              closingSequence = {
                type: use > 1 ? 'strongSequence' : 'emphasisSequence',
                start: shallow_1(events[index][1].start),
                end: movePoint_1(shallow_1(events[index][1].start), use)
              };
              text = {
                type: use > 1 ? 'strongText' : 'emphasisText',
                start: shallow_1(events[open][1].end),
                end: shallow_1(events[index][1].start)
              };
              group = {
                type: use > 1 ? 'strong' : 'emphasis',
                start: shallow_1(openingSequence.start),
                end: shallow_1(closingSequence.end)
              };
              events[open][1].end = shallow_1(openingSequence.start);
              events[index][1].start = shallow_1(closingSequence.end);
              nextEvents = []; // If there are more markers in the opening, add them before.

              if (events[open][1].end.offset - events[open][1].start.offset) {
                nextEvents = chunkedPush_1(nextEvents, [
                  ['enter', events[open][1], context],
                  ['exit', events[open][1], context]
                ]);
              } // Opening.

              nextEvents = chunkedPush_1(nextEvents, [
                ['enter', group, context],
                ['enter', openingSequence, context],
                ['exit', openingSequence, context],
                ['enter', text, context]
              ]); // Between.

              nextEvents = chunkedPush_1(
                nextEvents,
                resolveAll_1(
                  context.parser.constructs.insideSpan.null,
                  events.slice(open + 1, index),
                  context
                )
              ); // Closing.

              nextEvents = chunkedPush_1(nextEvents, [
                ['exit', text, context],
                ['enter', closingSequence, context],
                ['exit', closingSequence, context],
                ['exit', group, context]
              ]); // If there are more markers in the closing, add them after.

              if (events[index][1].end.offset - events[index][1].start.offset) {
                offset = 2;
                nextEvents = chunkedPush_1(nextEvents, [
                  ['enter', events[index][1], context],
                  ['exit', events[index][1], context]
                ]);
              } else {
                offset = 0;
              }

              chunkedSplice_1(events, open - 1, index - open + 3, nextEvents);
              index = open + nextEvents.length - offset - 2;
              break
            }
          }
        }
      } // Remove remaining sequences.

      index = -1;

      while (++index < events.length) {
        if (events[index][1].type === 'attentionSequence') {
          events[index][1].type = 'data';
        }
      }

      return events
    }

    function tokenizeAttention(effects, ok) {
      var before = classifyCharacter_1(this.previous);
      var marker;
      return start

      function start(code) {
        effects.enter('attentionSequence');
        marker = code;
        return sequence(code)
      }

      function sequence(code) {
        var token;
        var after;
        var open;
        var close;

        if (code === marker) {
          effects.consume(code);
          return sequence
        }

        token = effects.exit('attentionSequence');
        after = classifyCharacter_1(code);
        open = !after || (after === 2 && before);
        close = !before || (before === 2 && after);
        token._open = marker === 42 ? open : open && (before || !close);
        token._close = marker === 42 ? close : close && (after || !open);
        return ok(code)
      }
    }

    var attention_1 = attention;

    var asciiAlphanumeric = regexCheck_1(/[\dA-Za-z]/);

    var asciiAlphanumeric_1 = asciiAlphanumeric;

    var asciiAlpha = regexCheck_1(/[A-Za-z]/);

    var asciiAlpha_1 = asciiAlpha;

    var asciiAtext = regexCheck_1(/[#-'*+\--9=?A-Z^-~]/);

    var asciiAtext_1 = asciiAtext;

    // Note: EOF is seen as ASCII control here, because `null < 32 == true`.
    function asciiControl(code) {
      return (
        // Special whitespace codes (which have negative values), C0 and Control
        // character DEL
        code < 32 || code === 127
      )
    }

    var asciiControl_1 = asciiControl;

    var autolink = {
      name: 'autolink',
      tokenize: tokenizeAutolink
    };

    function tokenizeAutolink(effects, ok, nok) {
      var size = 1;
      return start

      function start(code) {
        effects.enter('autolink');
        effects.enter('autolinkMarker');
        effects.consume(code);
        effects.exit('autolinkMarker');
        effects.enter('autolinkProtocol');
        return open
      }

      function open(code) {
        if (asciiAlpha_1(code)) {
          effects.consume(code);
          return schemeOrEmailAtext
        }

        return asciiAtext_1(code) ? emailAtext(code) : nok(code)
      }

      function schemeOrEmailAtext(code) {
        return code === 43 || code === 45 || code === 46 || asciiAlphanumeric_1(code)
          ? schemeInsideOrEmailAtext(code)
          : emailAtext(code)
      }

      function schemeInsideOrEmailAtext(code) {
        if (code === 58) {
          effects.consume(code);
          return urlInside
        }

        if (
          (code === 43 || code === 45 || code === 46 || asciiAlphanumeric_1(code)) &&
          size++ < 32
        ) {
          effects.consume(code);
          return schemeInsideOrEmailAtext
        }

        return emailAtext(code)
      }

      function urlInside(code) {
        if (code === 62) {
          effects.exit('autolinkProtocol');
          return end(code)
        }

        if (code === 32 || code === 60 || asciiControl_1(code)) {
          return nok(code)
        }

        effects.consume(code);
        return urlInside
      }

      function emailAtext(code) {
        if (code === 64) {
          effects.consume(code);
          size = 0;
          return emailAtSignOrDot
        }

        if (asciiAtext_1(code)) {
          effects.consume(code);
          return emailAtext
        }

        return nok(code)
      }

      function emailAtSignOrDot(code) {
        return asciiAlphanumeric_1(code) ? emailLabel(code) : nok(code)
      }

      function emailLabel(code) {
        if (code === 46) {
          effects.consume(code);
          size = 0;
          return emailAtSignOrDot
        }

        if (code === 62) {
          // Exit, then change the type.
          effects.exit('autolinkProtocol').type = 'autolinkEmail';
          return end(code)
        }

        return emailValue(code)
      }

      function emailValue(code) {
        if ((code === 45 || asciiAlphanumeric_1(code)) && size++ < 63) {
          effects.consume(code);
          return code === 45 ? emailValue : emailLabel
        }

        return nok(code)
      }

      function end(code) {
        effects.enter('autolinkMarker');
        effects.consume(code);
        effects.exit('autolinkMarker');
        effects.exit('autolink');
        return ok
      }
    }

    var autolink_1 = autolink;

    var blockQuote = {
      name: 'blockQuote',
      tokenize: tokenizeBlockQuoteStart,
      continuation: {
        tokenize: tokenizeBlockQuoteContinuation
      },
      exit: exit
    };

    function tokenizeBlockQuoteStart(effects, ok, nok) {
      var self = this;
      return start

      function start(code) {
        if (code === 62) {
          if (!self.containerState.open) {
            effects.enter('blockQuote', {
              _container: true
            });
            self.containerState.open = true;
          }

          effects.enter('blockQuotePrefix');
          effects.enter('blockQuoteMarker');
          effects.consume(code);
          effects.exit('blockQuoteMarker');
          return after
        }

        return nok(code)
      }

      function after(code) {
        if (markdownSpace_1(code)) {
          effects.enter('blockQuotePrefixWhitespace');
          effects.consume(code);
          effects.exit('blockQuotePrefixWhitespace');
          effects.exit('blockQuotePrefix');
          return ok
        }

        effects.exit('blockQuotePrefix');
        return ok(code)
      }
    }

    function tokenizeBlockQuoteContinuation(effects, ok, nok) {
      return factorySpace(
        effects,
        effects.attempt(blockQuote, ok, nok),
        'linePrefix',
        this.parser.constructs.disable.null.indexOf('codeIndented') > -1
          ? undefined
          : 4
      )
    }

    function exit(effects) {
      effects.exit('blockQuote');
    }

    var blockQuote_1 = blockQuote;

    var asciiPunctuation = regexCheck_1(/[!-/:-@[-`{-~]/);

    var asciiPunctuation_1 = asciiPunctuation;

    var characterEscape = {
      name: 'characterEscape',
      tokenize: tokenizeCharacterEscape
    };

    function tokenizeCharacterEscape(effects, ok, nok) {
      return start

      function start(code) {
        effects.enter('characterEscape');
        effects.enter('escapeMarker');
        effects.consume(code);
        effects.exit('escapeMarker');
        return open
      }

      function open(code) {
        if (asciiPunctuation_1(code)) {
          effects.enter('characterEscapeValue');
          effects.consume(code);
          effects.exit('characterEscapeValue');
          effects.exit('characterEscape');
          return ok
        }

        return nok(code)
      }
    }

    var characterEscape_1 = characterEscape;

    /* eslint-env browser */

    var el;

    var semicolon = 59; //  ';'

    var decodeEntity_browser = decodeEntity;

    function decodeEntity(characters) {
      var entity = '&' + characters + ';';
      var char;

      el = el || document.createElement('i');
      el.innerHTML = entity;
      char = el.textContent;

      // Some entities do not require the closing semicolon (`&not` - for instance),
      // which leads to situations where parsing the assumed entity of &notit; will
      // result in the string `¬it;`.  When we encounter a trailing semicolon after
      // parsing and the entity to decode was not a semicolon (`&semi;`), we can
      // assume that the matching was incomplete
      if (char.charCodeAt(char.length - 1) === semicolon && characters !== 'semi') {
        return false
      }

      // If the decoded string is equal to the input, the entity was not valid
      return char === entity ? false : char
    }

    var asciiDigit = regexCheck_1(/\d/);

    var asciiDigit_1 = asciiDigit;

    var asciiHexDigit = regexCheck_1(/[\dA-Fa-f]/);

    var asciiHexDigit_1 = asciiHexDigit;

    function _interopDefaultLegacy$1(e) {
      return e && typeof e === 'object' && 'default' in e ? e : {default: e}
    }

    var decodeEntity__default = /*#__PURE__*/ _interopDefaultLegacy$1(decodeEntity_browser);

    var characterReference = {
      name: 'characterReference',
      tokenize: tokenizeCharacterReference
    };

    function tokenizeCharacterReference(effects, ok, nok) {
      var self = this;
      var size = 0;
      var max;
      var test;
      return start

      function start(code) {
        effects.enter('characterReference');
        effects.enter('characterReferenceMarker');
        effects.consume(code);
        effects.exit('characterReferenceMarker');
        return open
      }

      function open(code) {
        if (code === 35) {
          effects.enter('characterReferenceMarkerNumeric');
          effects.consume(code);
          effects.exit('characterReferenceMarkerNumeric');
          return numeric
        }

        effects.enter('characterReferenceValue');
        max = 31;
        test = asciiAlphanumeric_1;
        return value(code)
      }

      function numeric(code) {
        if (code === 88 || code === 120) {
          effects.enter('characterReferenceMarkerHexadecimal');
          effects.consume(code);
          effects.exit('characterReferenceMarkerHexadecimal');
          effects.enter('characterReferenceValue');
          max = 6;
          test = asciiHexDigit_1;
          return value
        }

        effects.enter('characterReferenceValue');
        max = 7;
        test = asciiDigit_1;
        return value(code)
      }

      function value(code) {
        var token;

        if (code === 59 && size) {
          token = effects.exit('characterReferenceValue');

          if (
            test === asciiAlphanumeric_1 &&
            !decodeEntity__default['default'](self.sliceSerialize(token))
          ) {
            return nok(code)
          }

          effects.enter('characterReferenceMarker');
          effects.consume(code);
          effects.exit('characterReferenceMarker');
          effects.exit('characterReference');
          return ok
        }

        if (test(code) && size++ < max) {
          effects.consume(code);
          return value
        }

        return nok(code)
      }
    }

    var characterReference_1 = characterReference;

    var codeFenced = {
      name: 'codeFenced',
      tokenize: tokenizeCodeFenced,
      concrete: true
    };

    function tokenizeCodeFenced(effects, ok, nok) {
      var self = this;
      var closingFenceConstruct = {
        tokenize: tokenizeClosingFence,
        partial: true
      };
      var initialPrefix = prefixSize_1(this.events, 'linePrefix');
      var sizeOpen = 0;
      var marker;
      return start

      function start(code) {
        effects.enter('codeFenced');
        effects.enter('codeFencedFence');
        effects.enter('codeFencedFenceSequence');
        marker = code;
        return sequenceOpen(code)
      }

      function sequenceOpen(code) {
        if (code === marker) {
          effects.consume(code);
          sizeOpen++;
          return sequenceOpen
        }

        effects.exit('codeFencedFenceSequence');
        return sizeOpen < 3
          ? nok(code)
          : factorySpace(effects, infoOpen, 'whitespace')(code)
      }

      function infoOpen(code) {
        if (code === null || markdownLineEnding_1(code)) {
          return openAfter(code)
        }

        effects.enter('codeFencedFenceInfo');
        effects.enter('chunkString', {
          contentType: 'string'
        });
        return info(code)
      }

      function info(code) {
        if (code === null || markdownLineEndingOrSpace_1(code)) {
          effects.exit('chunkString');
          effects.exit('codeFencedFenceInfo');
          return factorySpace(effects, infoAfter, 'whitespace')(code)
        }

        if (code === 96 && code === marker) return nok(code)
        effects.consume(code);
        return info
      }

      function infoAfter(code) {
        if (code === null || markdownLineEnding_1(code)) {
          return openAfter(code)
        }

        effects.enter('codeFencedFenceMeta');
        effects.enter('chunkString', {
          contentType: 'string'
        });
        return meta(code)
      }

      function meta(code) {
        if (code === null || markdownLineEnding_1(code)) {
          effects.exit('chunkString');
          effects.exit('codeFencedFenceMeta');
          return openAfter(code)
        }

        if (code === 96 && code === marker) return nok(code)
        effects.consume(code);
        return meta
      }

      function openAfter(code) {
        effects.exit('codeFencedFence');
        return self.interrupt ? ok(code) : content(code)
      }

      function content(code) {
        if (code === null) {
          return after(code)
        }

        if (markdownLineEnding_1(code)) {
          effects.enter('lineEnding');
          effects.consume(code);
          effects.exit('lineEnding');
          return effects.attempt(
            closingFenceConstruct,
            after,
            initialPrefix
              ? factorySpace(effects, content, 'linePrefix', initialPrefix + 1)
              : content
          )
        }

        effects.enter('codeFlowValue');
        return contentContinue(code)
      }

      function contentContinue(code) {
        if (code === null || markdownLineEnding_1(code)) {
          effects.exit('codeFlowValue');
          return content(code)
        }

        effects.consume(code);
        return contentContinue
      }

      function after(code) {
        effects.exit('codeFenced');
        return ok(code)
      }

      function tokenizeClosingFence(effects, ok, nok) {
        var size = 0;
        return factorySpace(
          effects,
          closingSequenceStart,
          'linePrefix',
          this.parser.constructs.disable.null.indexOf('codeIndented') > -1
            ? undefined
            : 4
        )

        function closingSequenceStart(code) {
          effects.enter('codeFencedFence');
          effects.enter('codeFencedFenceSequence');
          return closingSequence(code)
        }

        function closingSequence(code) {
          if (code === marker) {
            effects.consume(code);
            size++;
            return closingSequence
          }

          if (size < sizeOpen) return nok(code)
          effects.exit('codeFencedFenceSequence');
          return factorySpace(effects, closingSequenceEnd, 'whitespace')(code)
        }

        function closingSequenceEnd(code) {
          if (code === null || markdownLineEnding_1(code)) {
            effects.exit('codeFencedFence');
            return ok(code)
          }

          return nok(code)
        }
      }
    }

    var codeFenced_1 = codeFenced;

    var codeIndented = {
      name: 'codeIndented',
      tokenize: tokenizeCodeIndented,
      resolve: resolveCodeIndented
    };
    var indentedContentConstruct = {
      tokenize: tokenizeIndentedContent,
      partial: true
    };

    function resolveCodeIndented(events, context) {
      var code = {
        type: 'codeIndented',
        start: events[0][1].start,
        end: events[events.length - 1][1].end
      };
      chunkedSplice_1(events, 0, 0, [['enter', code, context]]);
      chunkedSplice_1(events, events.length, 0, [['exit', code, context]]);
      return events
    }

    function tokenizeCodeIndented(effects, ok, nok) {
      return effects.attempt(indentedContentConstruct, afterPrefix, nok)

      function afterPrefix(code) {
        if (code === null) {
          return ok(code)
        }

        if (markdownLineEnding_1(code)) {
          return effects.attempt(indentedContentConstruct, afterPrefix, ok)(code)
        }

        effects.enter('codeFlowValue');
        return content(code)
      }

      function content(code) {
        if (code === null || markdownLineEnding_1(code)) {
          effects.exit('codeFlowValue');
          return afterPrefix(code)
        }

        effects.consume(code);
        return content
      }
    }

    function tokenizeIndentedContent(effects, ok, nok) {
      var self = this;
      return factorySpace(effects, afterPrefix, 'linePrefix', 4 + 1)

      function afterPrefix(code) {
        if (markdownLineEnding_1(code)) {
          effects.enter('lineEnding');
          effects.consume(code);
          effects.exit('lineEnding');
          return factorySpace(effects, afterPrefix, 'linePrefix', 4 + 1)
        }

        return prefixSize_1(self.events, 'linePrefix') < 4 ? nok(code) : ok(code)
      }
    }

    var codeIndented_1 = codeIndented;

    var codeText = {
      name: 'codeText',
      tokenize: tokenizeCodeText,
      resolve: resolveCodeText,
      previous: previous
    };

    function resolveCodeText(events) {
      var tailExitIndex = events.length - 4;
      var headEnterIndex = 3;
      var index;
      var enter; // If we start and end with an EOL or a space.

      if (
        (events[headEnterIndex][1].type === 'lineEnding' ||
          events[headEnterIndex][1].type === 'space') &&
        (events[tailExitIndex][1].type === 'lineEnding' ||
          events[tailExitIndex][1].type === 'space')
      ) {
        index = headEnterIndex; // And we have data.

        while (++index < tailExitIndex) {
          if (events[index][1].type === 'codeTextData') {
            // Then we have padding.
            events[tailExitIndex][1].type = events[headEnterIndex][1].type =
              'codeTextPadding';
            headEnterIndex += 2;
            tailExitIndex -= 2;
            break
          }
        }
      } // Merge adjacent spaces and data.

      index = headEnterIndex - 1;
      tailExitIndex++;

      while (++index <= tailExitIndex) {
        if (enter === undefined) {
          if (index !== tailExitIndex && events[index][1].type !== 'lineEnding') {
            enter = index;
          }
        } else if (
          index === tailExitIndex ||
          events[index][1].type === 'lineEnding'
        ) {
          events[enter][1].type = 'codeTextData';

          if (index !== enter + 2) {
            events[enter][1].end = events[index - 1][1].end;
            events.splice(enter + 2, index - enter - 2);
            tailExitIndex -= index - enter - 2;
            index = enter + 2;
          }

          enter = undefined;
        }
      }

      return events
    }

    function previous(code) {
      // If there is a previous code, there will always be a tail.
      return (
        code !== 96 ||
        this.events[this.events.length - 1][1].type === 'characterEscape'
      )
    }

    function tokenizeCodeText(effects, ok, nok) {
      var sizeOpen = 0;
      var size;
      var token;
      return start

      function start(code) {
        effects.enter('codeText');
        effects.enter('codeTextSequence');
        return openingSequence(code)
      }

      function openingSequence(code) {
        if (code === 96) {
          effects.consume(code);
          sizeOpen++;
          return openingSequence
        }

        effects.exit('codeTextSequence');
        return gap(code)
      }

      function gap(code) {
        // EOF.
        if (code === null) {
          return nok(code)
        } // Closing fence?
        // Could also be data.

        if (code === 96) {
          token = effects.enter('codeTextSequence');
          size = 0;
          return closingSequence(code)
        } // Tabs don’t work, and virtual spaces don’t make sense.

        if (code === 32) {
          effects.enter('space');
          effects.consume(code);
          effects.exit('space');
          return gap
        }

        if (markdownLineEnding_1(code)) {
          effects.enter('lineEnding');
          effects.consume(code);
          effects.exit('lineEnding');
          return gap
        } // Data.

        effects.enter('codeTextData');
        return data(code)
      } // In code.

      function data(code) {
        if (
          code === null ||
          code === 32 ||
          code === 96 ||
          markdownLineEnding_1(code)
        ) {
          effects.exit('codeTextData');
          return gap(code)
        }

        effects.consume(code);
        return data
      } // Closing fence.

      function closingSequence(code) {
        // More.
        if (code === 96) {
          effects.consume(code);
          size++;
          return closingSequence
        } // Done!

        if (size === sizeOpen) {
          effects.exit('codeTextSequence');
          effects.exit('codeText');
          return ok(code)
        } // More or less accents: mark as data.

        token.type = 'codeTextData';
        return data(code)
      }
    }

    var codeText_1 = codeText;

    // eslint-disable-next-line max-params
    function destinationFactory(
      effects,
      ok,
      nok,
      type,
      literalType,
      literalMarkerType,
      rawType,
      stringType,
      max
    ) {
      var limit = max || Infinity;
      var balance = 0;
      return start

      function start(code) {
        if (code === 60) {
          effects.enter(type);
          effects.enter(literalType);
          effects.enter(literalMarkerType);
          effects.consume(code);
          effects.exit(literalMarkerType);
          return destinationEnclosedBefore
        }

        if (asciiControl_1(code)) {
          return nok(code)
        }

        effects.enter(type);
        effects.enter(rawType);
        effects.enter(stringType);
        effects.enter('chunkString', {
          contentType: 'string'
        });
        return destinationRaw(code)
      }

      function destinationEnclosedBefore(code) {
        if (code === 62) {
          effects.enter(literalMarkerType);
          effects.consume(code);
          effects.exit(literalMarkerType);
          effects.exit(literalType);
          effects.exit(type);
          return ok
        }

        effects.enter(stringType);
        effects.enter('chunkString', {
          contentType: 'string'
        });
        return destinationEnclosed(code)
      }

      function destinationEnclosed(code) {
        if (code === 62) {
          effects.exit('chunkString');
          effects.exit(stringType);
          return destinationEnclosedBefore(code)
        }

        if (code === null || code === 60 || markdownLineEnding_1(code)) {
          return nok(code)
        }

        effects.consume(code);
        return code === 92 ? destinationEnclosedEscape : destinationEnclosed
      }

      function destinationEnclosedEscape(code) {
        if (code === 60 || code === 62 || code === 92) {
          effects.consume(code);
          return destinationEnclosed
        }

        return destinationEnclosed(code)
      }

      function destinationRaw(code) {
        if (code === 40) {
          if (++balance > limit) return nok(code)
          effects.consume(code);
          return destinationRaw
        }

        if (code === 41) {
          if (!balance--) {
            effects.exit('chunkString');
            effects.exit(stringType);
            effects.exit(rawType);
            effects.exit(type);
            return ok(code)
          }

          effects.consume(code);
          return destinationRaw
        }

        if (code === null || markdownLineEndingOrSpace_1(code)) {
          if (balance) return nok(code)
          effects.exit('chunkString');
          effects.exit(stringType);
          effects.exit(rawType);
          effects.exit(type);
          return ok(code)
        }

        if (asciiControl_1(code)) return nok(code)
        effects.consume(code);
        return code === 92 ? destinationRawEscape : destinationRaw
      }

      function destinationRawEscape(code) {
        if (code === 40 || code === 41 || code === 92) {
          effects.consume(code);
          return destinationRaw
        }

        return destinationRaw(code)
      }
    }

    var factoryDestination = destinationFactory;

    // eslint-disable-next-line max-params
    function labelFactory(effects, ok, nok, type, markerType, stringType) {
      var self = this;
      var size = 0;
      var data;
      return start

      function start(code) {
        effects.enter(type);
        effects.enter(markerType);
        effects.consume(code);
        effects.exit(markerType);
        effects.enter(stringType);
        return atBreak
      }

      function atBreak(code) {
        if (
          code === null ||
          code === 91 ||
          (code === 93 && !data) ||
          /* c8 ignore next */
          (code === 94 &&
            /* c8 ignore next */
            !size &&
            /* c8 ignore next */
            '_hiddenFootnoteSupport' in self.parser.constructs) ||
          size > 999
        ) {
          return nok(code)
        }

        if (code === 93) {
          effects.exit(stringType);
          effects.enter(markerType);
          effects.consume(code);
          effects.exit(markerType);
          effects.exit(type);
          return ok
        }

        if (markdownLineEnding_1(code)) {
          effects.enter('lineEnding');
          effects.consume(code);
          effects.exit('lineEnding');
          return atBreak
        }

        effects.enter('chunkString', {
          contentType: 'string'
        });
        return label(code)
      }

      function label(code) {
        if (
          code === null ||
          code === 91 ||
          code === 93 ||
          markdownLineEnding_1(code) ||
          size++ > 999
        ) {
          effects.exit('chunkString');
          return atBreak(code)
        }

        effects.consume(code);
        data = data || !markdownSpace_1(code);
        return code === 92 ? labelEscape : label
      }

      function labelEscape(code) {
        if (code === 91 || code === 92 || code === 93) {
          effects.consume(code);
          size++;
          return label
        }

        return label(code)
      }
    }

    var factoryLabel = labelFactory;

    function whitespaceFactory(effects, ok) {
      var seen;
      return start

      function start(code) {
        if (markdownLineEnding_1(code)) {
          effects.enter('lineEnding');
          effects.consume(code);
          effects.exit('lineEnding');
          seen = true;
          return start
        }

        if (markdownSpace_1(code)) {
          return factorySpace(
            effects,
            start,
            seen ? 'linePrefix' : 'lineSuffix'
          )(code)
        }

        return ok(code)
      }
    }

    var factoryWhitespace = whitespaceFactory;

    function titleFactory(effects, ok, nok, type, markerType, stringType) {
      var marker;
      return start

      function start(code) {
        effects.enter(type);
        effects.enter(markerType);
        effects.consume(code);
        effects.exit(markerType);
        marker = code === 40 ? 41 : code;
        return atFirstTitleBreak
      }

      function atFirstTitleBreak(code) {
        if (code === marker) {
          effects.enter(markerType);
          effects.consume(code);
          effects.exit(markerType);
          effects.exit(type);
          return ok
        }

        effects.enter(stringType);
        return atTitleBreak(code)
      }

      function atTitleBreak(code) {
        if (code === marker) {
          effects.exit(stringType);
          return atFirstTitleBreak(marker)
        }

        if (code === null) {
          return nok(code)
        } // Note: blank lines can’t exist in content.

        if (markdownLineEnding_1(code)) {
          effects.enter('lineEnding');
          effects.consume(code);
          effects.exit('lineEnding');
          return factorySpace(effects, atTitleBreak, 'linePrefix')
        }

        effects.enter('chunkString', {
          contentType: 'string'
        });
        return title(code)
      }

      function title(code) {
        if (code === marker || code === null || markdownLineEnding_1(code)) {
          effects.exit('chunkString');
          return atTitleBreak(code)
        }

        effects.consume(code);
        return code === 92 ? titleEscape : title
      }

      function titleEscape(code) {
        if (code === marker || code === 92) {
          effects.consume(code);
          return title
        }

        return title(code)
      }
    }

    var factoryTitle = titleFactory;

    var definition = {
      name: 'definition',
      tokenize: tokenizeDefinition
    };
    var titleConstruct = {
      tokenize: tokenizeTitle,
      partial: true
    };

    function tokenizeDefinition(effects, ok, nok) {
      var self = this;
      var identifier;
      return start

      function start(code) {
        effects.enter('definition');
        return factoryLabel.call(
          self,
          effects,
          labelAfter,
          nok,
          'definitionLabel',
          'definitionLabelMarker',
          'definitionLabelString'
        )(code)
      }

      function labelAfter(code) {
        identifier = normalizeIdentifier_1(
          self.sliceSerialize(self.events[self.events.length - 1][1]).slice(1, -1)
        );

        if (code === 58) {
          effects.enter('definitionMarker');
          effects.consume(code);
          effects.exit('definitionMarker'); // Note: blank lines can’t exist in content.

          return factoryWhitespace(
            effects,
            factoryDestination(
              effects,
              effects.attempt(
                titleConstruct,
                factorySpace(effects, after, 'whitespace'),
                factorySpace(effects, after, 'whitespace')
              ),
              nok,
              'definitionDestination',
              'definitionDestinationLiteral',
              'definitionDestinationLiteralMarker',
              'definitionDestinationRaw',
              'definitionDestinationString'
            )
          )
        }

        return nok(code)
      }

      function after(code) {
        if (code === null || markdownLineEnding_1(code)) {
          effects.exit('definition');

          if (self.parser.defined.indexOf(identifier) < 0) {
            self.parser.defined.push(identifier);
          }

          return ok(code)
        }

        return nok(code)
      }
    }

    function tokenizeTitle(effects, ok, nok) {
      return start

      function start(code) {
        return markdownLineEndingOrSpace_1(code)
          ? factoryWhitespace(effects, before)(code)
          : nok(code)
      }

      function before(code) {
        if (code === 34 || code === 39 || code === 40) {
          return factoryTitle(
            effects,
            factorySpace(effects, after, 'whitespace'),
            nok,
            'definitionTitle',
            'definitionTitleMarker',
            'definitionTitleString'
          )(code)
        }

        return nok(code)
      }

      function after(code) {
        return code === null || markdownLineEnding_1(code) ? ok(code) : nok(code)
      }
    }

    var definition_1 = definition;

    var hardBreakEscape = {
      name: 'hardBreakEscape',
      tokenize: tokenizeHardBreakEscape
    };

    function tokenizeHardBreakEscape(effects, ok, nok) {
      return start

      function start(code) {
        effects.enter('hardBreakEscape');
        effects.enter('escapeMarker');
        effects.consume(code);
        return open
      }

      function open(code) {
        if (markdownLineEnding_1(code)) {
          effects.exit('escapeMarker');
          effects.exit('hardBreakEscape');
          return ok(code)
        }

        return nok(code)
      }
    }

    var hardBreakEscape_1 = hardBreakEscape;

    var headingAtx = {
      name: 'headingAtx',
      tokenize: tokenizeHeadingAtx,
      resolve: resolveHeadingAtx
    };

    function resolveHeadingAtx(events, context) {
      var contentEnd = events.length - 2;
      var contentStart = 3;
      var content;
      var text; // Prefix whitespace, part of the opening.

      if (events[contentStart][1].type === 'whitespace') {
        contentStart += 2;
      } // Suffix whitespace, part of the closing.

      if (
        contentEnd - 2 > contentStart &&
        events[contentEnd][1].type === 'whitespace'
      ) {
        contentEnd -= 2;
      }

      if (
        events[contentEnd][1].type === 'atxHeadingSequence' &&
        (contentStart === contentEnd - 1 ||
          (contentEnd - 4 > contentStart &&
            events[contentEnd - 2][1].type === 'whitespace'))
      ) {
        contentEnd -= contentStart + 1 === contentEnd ? 2 : 4;
      }

      if (contentEnd > contentStart) {
        content = {
          type: 'atxHeadingText',
          start: events[contentStart][1].start,
          end: events[contentEnd][1].end
        };
        text = {
          type: 'chunkText',
          start: events[contentStart][1].start,
          end: events[contentEnd][1].end,
          contentType: 'text'
        };
        chunkedSplice_1(events, contentStart, contentEnd - contentStart + 1, [
          ['enter', content, context],
          ['enter', text, context],
          ['exit', text, context],
          ['exit', content, context]
        ]);
      }

      return events
    }

    function tokenizeHeadingAtx(effects, ok, nok) {
      var self = this;
      var size = 0;
      return start

      function start(code) {
        effects.enter('atxHeading');
        effects.enter('atxHeadingSequence');
        return fenceOpenInside(code)
      }

      function fenceOpenInside(code) {
        if (code === 35 && size++ < 6) {
          effects.consume(code);
          return fenceOpenInside
        }

        if (code === null || markdownLineEndingOrSpace_1(code)) {
          effects.exit('atxHeadingSequence');
          return self.interrupt ? ok(code) : headingBreak(code)
        }

        return nok(code)
      }

      function headingBreak(code) {
        if (code === 35) {
          effects.enter('atxHeadingSequence');
          return sequence(code)
        }

        if (code === null || markdownLineEnding_1(code)) {
          effects.exit('atxHeading');
          return ok(code)
        }

        if (markdownSpace_1(code)) {
          return factorySpace(effects, headingBreak, 'whitespace')(code)
        }

        effects.enter('atxHeadingText');
        return data(code)
      }

      function sequence(code) {
        if (code === 35) {
          effects.consume(code);
          return sequence
        }

        effects.exit('atxHeadingSequence');
        return headingBreak(code)
      }

      function data(code) {
        if (code === null || code === 35 || markdownLineEndingOrSpace_1(code)) {
          effects.exit('atxHeadingText');
          return headingBreak(code)
        }

        effects.consume(code);
        return data
      }
    }

    var headingAtx_1 = headingAtx;

    // This module is copied from <https://spec.commonmark.org/0.29/#html-blocks>.
    var basics = [
      'address',
      'article',
      'aside',
      'base',
      'basefont',
      'blockquote',
      'body',
      'caption',
      'center',
      'col',
      'colgroup',
      'dd',
      'details',
      'dialog',
      'dir',
      'div',
      'dl',
      'dt',
      'fieldset',
      'figcaption',
      'figure',
      'footer',
      'form',
      'frame',
      'frameset',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'head',
      'header',
      'hr',
      'html',
      'iframe',
      'legend',
      'li',
      'link',
      'main',
      'menu',
      'menuitem',
      'nav',
      'noframes',
      'ol',
      'optgroup',
      'option',
      'p',
      'param',
      'section',
      'source',
      'summary',
      'table',
      'tbody',
      'td',
      'tfoot',
      'th',
      'thead',
      'title',
      'tr',
      'track',
      'ul'
    ];

    var htmlBlockNames = basics;

    // This module is copied from <https://spec.commonmark.org/0.29/#html-blocks>.
    var raws = ['pre', 'script', 'style', 'textarea'];

    var htmlRawNames = raws;

    var htmlFlow = {
      name: 'htmlFlow',
      tokenize: tokenizeHtmlFlow,
      resolveTo: resolveToHtmlFlow,
      concrete: true
    };
    var nextBlankConstruct = {
      tokenize: tokenizeNextBlank,
      partial: true
    };

    function resolveToHtmlFlow(events) {
      var index = events.length;

      while (index--) {
        if (events[index][0] === 'enter' && events[index][1].type === 'htmlFlow') {
          break
        }
      }

      if (index > 1 && events[index - 2][1].type === 'linePrefix') {
        // Add the prefix start to the HTML token.
        events[index][1].start = events[index - 2][1].start; // Add the prefix start to the HTML line token.

        events[index + 1][1].start = events[index - 2][1].start; // Remove the line prefix.

        events.splice(index - 2, 2);
      }

      return events
    }

    function tokenizeHtmlFlow(effects, ok, nok) {
      var self = this;
      var kind;
      var startTag;
      var buffer;
      var index;
      var marker;
      return start

      function start(code) {
        effects.enter('htmlFlow');
        effects.enter('htmlFlowData');
        effects.consume(code);
        return open
      }

      function open(code) {
        if (code === 33) {
          effects.consume(code);
          return declarationStart
        }

        if (code === 47) {
          effects.consume(code);
          return tagCloseStart
        }

        if (code === 63) {
          effects.consume(code);
          kind = 3; // While we’re in an instruction instead of a declaration, we’re on a `?`
          // right now, so we do need to search for `>`, similar to declarations.

          return self.interrupt ? ok : continuationDeclarationInside
        }

        if (asciiAlpha_1(code)) {
          effects.consume(code);
          buffer = fromCharCode_1(code);
          startTag = true;
          return tagName
        }

        return nok(code)
      }

      function declarationStart(code) {
        if (code === 45) {
          effects.consume(code);
          kind = 2;
          return commentOpenInside
        }

        if (code === 91) {
          effects.consume(code);
          kind = 5;
          buffer = 'CDATA[';
          index = 0;
          return cdataOpenInside
        }

        if (asciiAlpha_1(code)) {
          effects.consume(code);
          kind = 4;
          return self.interrupt ? ok : continuationDeclarationInside
        }

        return nok(code)
      }

      function commentOpenInside(code) {
        if (code === 45) {
          effects.consume(code);
          return self.interrupt ? ok : continuationDeclarationInside
        }

        return nok(code)
      }

      function cdataOpenInside(code) {
        if (code === buffer.charCodeAt(index++)) {
          effects.consume(code);
          return index === buffer.length
            ? self.interrupt
              ? ok
              : continuation
            : cdataOpenInside
        }

        return nok(code)
      }

      function tagCloseStart(code) {
        if (asciiAlpha_1(code)) {
          effects.consume(code);
          buffer = fromCharCode_1(code);
          return tagName
        }

        return nok(code)
      }

      function tagName(code) {
        if (
          code === null ||
          code === 47 ||
          code === 62 ||
          markdownLineEndingOrSpace_1(code)
        ) {
          if (
            code !== 47 &&
            startTag &&
            htmlRawNames.indexOf(buffer.toLowerCase()) > -1
          ) {
            kind = 1;
            return self.interrupt ? ok(code) : continuation(code)
          }

          if (htmlBlockNames.indexOf(buffer.toLowerCase()) > -1) {
            kind = 6;

            if (code === 47) {
              effects.consume(code);
              return basicSelfClosing
            }

            return self.interrupt ? ok(code) : continuation(code)
          }

          kind = 7; // Do not support complete HTML when interrupting.

          return self.interrupt
            ? nok(code)
            : startTag
            ? completeAttributeNameBefore(code)
            : completeClosingTagAfter(code)
        }

        if (code === 45 || asciiAlphanumeric_1(code)) {
          effects.consume(code);
          buffer += fromCharCode_1(code);
          return tagName
        }

        return nok(code)
      }

      function basicSelfClosing(code) {
        if (code === 62) {
          effects.consume(code);
          return self.interrupt ? ok : continuation
        }

        return nok(code)
      }

      function completeClosingTagAfter(code) {
        if (markdownSpace_1(code)) {
          effects.consume(code);
          return completeClosingTagAfter
        }

        return completeEnd(code)
      }

      function completeAttributeNameBefore(code) {
        if (code === 47) {
          effects.consume(code);
          return completeEnd
        }

        if (code === 58 || code === 95 || asciiAlpha_1(code)) {
          effects.consume(code);
          return completeAttributeName
        }

        if (markdownSpace_1(code)) {
          effects.consume(code);
          return completeAttributeNameBefore
        }

        return completeEnd(code)
      }

      function completeAttributeName(code) {
        if (
          code === 45 ||
          code === 46 ||
          code === 58 ||
          code === 95 ||
          asciiAlphanumeric_1(code)
        ) {
          effects.consume(code);
          return completeAttributeName
        }

        return completeAttributeNameAfter(code)
      }

      function completeAttributeNameAfter(code) {
        if (code === 61) {
          effects.consume(code);
          return completeAttributeValueBefore
        }

        if (markdownSpace_1(code)) {
          effects.consume(code);
          return completeAttributeNameAfter
        }

        return completeAttributeNameBefore(code)
      }

      function completeAttributeValueBefore(code) {
        if (
          code === null ||
          code === 60 ||
          code === 61 ||
          code === 62 ||
          code === 96
        ) {
          return nok(code)
        }

        if (code === 34 || code === 39) {
          effects.consume(code);
          marker = code;
          return completeAttributeValueQuoted
        }

        if (markdownSpace_1(code)) {
          effects.consume(code);
          return completeAttributeValueBefore
        }

        marker = undefined;
        return completeAttributeValueUnquoted(code)
      }

      function completeAttributeValueQuoted(code) {
        if (code === marker) {
          effects.consume(code);
          return completeAttributeValueQuotedAfter
        }

        if (code === null || markdownLineEnding_1(code)) {
          return nok(code)
        }

        effects.consume(code);
        return completeAttributeValueQuoted
      }

      function completeAttributeValueUnquoted(code) {
        if (
          code === null ||
          code === 34 ||
          code === 39 ||
          code === 60 ||
          code === 61 ||
          code === 62 ||
          code === 96 ||
          markdownLineEndingOrSpace_1(code)
        ) {
          return completeAttributeNameAfter(code)
        }

        effects.consume(code);
        return completeAttributeValueUnquoted
      }

      function completeAttributeValueQuotedAfter(code) {
        if (code === 47 || code === 62 || markdownSpace_1(code)) {
          return completeAttributeNameBefore(code)
        }

        return nok(code)
      }

      function completeEnd(code) {
        if (code === 62) {
          effects.consume(code);
          return completeAfter
        }

        return nok(code)
      }

      function completeAfter(code) {
        if (markdownSpace_1(code)) {
          effects.consume(code);
          return completeAfter
        }

        return code === null || markdownLineEnding_1(code)
          ? continuation(code)
          : nok(code)
      }

      function continuation(code) {
        if (code === 45 && kind === 2) {
          effects.consume(code);
          return continuationCommentInside
        }

        if (code === 60 && kind === 1) {
          effects.consume(code);
          return continuationRawTagOpen
        }

        if (code === 62 && kind === 4) {
          effects.consume(code);
          return continuationClose
        }

        if (code === 63 && kind === 3) {
          effects.consume(code);
          return continuationDeclarationInside
        }

        if (code === 93 && kind === 5) {
          effects.consume(code);
          return continuationCharacterDataInside
        }

        if (markdownLineEnding_1(code) && (kind === 6 || kind === 7)) {
          return effects.check(
            nextBlankConstruct,
            continuationClose,
            continuationAtLineEnding
          )(code)
        }

        if (code === null || markdownLineEnding_1(code)) {
          return continuationAtLineEnding(code)
        }

        effects.consume(code);
        return continuation
      }

      function continuationAtLineEnding(code) {
        effects.exit('htmlFlowData');
        return htmlContinueStart(code)
      }

      function htmlContinueStart(code) {
        if (code === null) {
          return done(code)
        }

        if (markdownLineEnding_1(code)) {
          effects.enter('lineEnding');
          effects.consume(code);
          effects.exit('lineEnding');
          return htmlContinueStart
        }

        effects.enter('htmlFlowData');
        return continuation(code)
      }

      function continuationCommentInside(code) {
        if (code === 45) {
          effects.consume(code);
          return continuationDeclarationInside
        }

        return continuation(code)
      }

      function continuationRawTagOpen(code) {
        if (code === 47) {
          effects.consume(code);
          buffer = '';
          return continuationRawEndTag
        }

        return continuation(code)
      }

      function continuationRawEndTag(code) {
        if (code === 62 && htmlRawNames.indexOf(buffer.toLowerCase()) > -1) {
          effects.consume(code);
          return continuationClose
        }

        if (asciiAlpha_1(code) && buffer.length < 8) {
          effects.consume(code);
          buffer += fromCharCode_1(code);
          return continuationRawEndTag
        }

        return continuation(code)
      }

      function continuationCharacterDataInside(code) {
        if (code === 93) {
          effects.consume(code);
          return continuationDeclarationInside
        }

        return continuation(code)
      }

      function continuationDeclarationInside(code) {
        if (code === 62) {
          effects.consume(code);
          return continuationClose
        }

        return continuation(code)
      }

      function continuationClose(code) {
        if (code === null || markdownLineEnding_1(code)) {
          effects.exit('htmlFlowData');
          return done(code)
        }

        effects.consume(code);
        return continuationClose
      }

      function done(code) {
        effects.exit('htmlFlow');
        return ok(code)
      }
    }

    function tokenizeNextBlank(effects, ok, nok) {
      return start

      function start(code) {
        effects.exit('htmlFlowData');
        effects.enter('lineEndingBlank');
        effects.consume(code);
        effects.exit('lineEndingBlank');
        return effects.attempt(partialBlankLine_1, ok, nok)
      }
    }

    var htmlFlow_1 = htmlFlow;

    var htmlText = {
      name: 'htmlText',
      tokenize: tokenizeHtmlText
    };

    function tokenizeHtmlText(effects, ok, nok) {
      var self = this;
      var marker;
      var buffer;
      var index;
      var returnState;
      return start

      function start(code) {
        effects.enter('htmlText');
        effects.enter('htmlTextData');
        effects.consume(code);
        return open
      }

      function open(code) {
        if (code === 33) {
          effects.consume(code);
          return declarationOpen
        }

        if (code === 47) {
          effects.consume(code);
          return tagCloseStart
        }

        if (code === 63) {
          effects.consume(code);
          return instruction
        }

        if (asciiAlpha_1(code)) {
          effects.consume(code);
          return tagOpen
        }

        return nok(code)
      }

      function declarationOpen(code) {
        if (code === 45) {
          effects.consume(code);
          return commentOpen
        }

        if (code === 91) {
          effects.consume(code);
          buffer = 'CDATA[';
          index = 0;
          return cdataOpen
        }

        if (asciiAlpha_1(code)) {
          effects.consume(code);
          return declaration
        }

        return nok(code)
      }

      function commentOpen(code) {
        if (code === 45) {
          effects.consume(code);
          return commentStart
        }

        return nok(code)
      }

      function commentStart(code) {
        if (code === null || code === 62) {
          return nok(code)
        }

        if (code === 45) {
          effects.consume(code);
          return commentStartDash
        }

        return comment(code)
      }

      function commentStartDash(code) {
        if (code === null || code === 62) {
          return nok(code)
        }

        return comment(code)
      }

      function comment(code) {
        if (code === null) {
          return nok(code)
        }

        if (code === 45) {
          effects.consume(code);
          return commentClose
        }

        if (markdownLineEnding_1(code)) {
          returnState = comment;
          return atLineEnding(code)
        }

        effects.consume(code);
        return comment
      }

      function commentClose(code) {
        if (code === 45) {
          effects.consume(code);
          return end
        }

        return comment(code)
      }

      function cdataOpen(code) {
        if (code === buffer.charCodeAt(index++)) {
          effects.consume(code);
          return index === buffer.length ? cdata : cdataOpen
        }

        return nok(code)
      }

      function cdata(code) {
        if (code === null) {
          return nok(code)
        }

        if (code === 93) {
          effects.consume(code);
          return cdataClose
        }

        if (markdownLineEnding_1(code)) {
          returnState = cdata;
          return atLineEnding(code)
        }

        effects.consume(code);
        return cdata
      }

      function cdataClose(code) {
        if (code === 93) {
          effects.consume(code);
          return cdataEnd
        }

        return cdata(code)
      }

      function cdataEnd(code) {
        if (code === 62) {
          return end(code)
        }

        if (code === 93) {
          effects.consume(code);
          return cdataEnd
        }

        return cdata(code)
      }

      function declaration(code) {
        if (code === null || code === 62) {
          return end(code)
        }

        if (markdownLineEnding_1(code)) {
          returnState = declaration;
          return atLineEnding(code)
        }

        effects.consume(code);
        return declaration
      }

      function instruction(code) {
        if (code === null) {
          return nok(code)
        }

        if (code === 63) {
          effects.consume(code);
          return instructionClose
        }

        if (markdownLineEnding_1(code)) {
          returnState = instruction;
          return atLineEnding(code)
        }

        effects.consume(code);
        return instruction
      }

      function instructionClose(code) {
        return code === 62 ? end(code) : instruction(code)
      }

      function tagCloseStart(code) {
        if (asciiAlpha_1(code)) {
          effects.consume(code);
          return tagClose
        }

        return nok(code)
      }

      function tagClose(code) {
        if (code === 45 || asciiAlphanumeric_1(code)) {
          effects.consume(code);
          return tagClose
        }

        return tagCloseBetween(code)
      }

      function tagCloseBetween(code) {
        if (markdownLineEnding_1(code)) {
          returnState = tagCloseBetween;
          return atLineEnding(code)
        }

        if (markdownSpace_1(code)) {
          effects.consume(code);
          return tagCloseBetween
        }

        return end(code)
      }

      function tagOpen(code) {
        if (code === 45 || asciiAlphanumeric_1(code)) {
          effects.consume(code);
          return tagOpen
        }

        if (code === 47 || code === 62 || markdownLineEndingOrSpace_1(code)) {
          return tagOpenBetween(code)
        }

        return nok(code)
      }

      function tagOpenBetween(code) {
        if (code === 47) {
          effects.consume(code);
          return end
        }

        if (code === 58 || code === 95 || asciiAlpha_1(code)) {
          effects.consume(code);
          return tagOpenAttributeName
        }

        if (markdownLineEnding_1(code)) {
          returnState = tagOpenBetween;
          return atLineEnding(code)
        }

        if (markdownSpace_1(code)) {
          effects.consume(code);
          return tagOpenBetween
        }

        return end(code)
      }

      function tagOpenAttributeName(code) {
        if (
          code === 45 ||
          code === 46 ||
          code === 58 ||
          code === 95 ||
          asciiAlphanumeric_1(code)
        ) {
          effects.consume(code);
          return tagOpenAttributeName
        }

        return tagOpenAttributeNameAfter(code)
      }

      function tagOpenAttributeNameAfter(code) {
        if (code === 61) {
          effects.consume(code);
          return tagOpenAttributeValueBefore
        }

        if (markdownLineEnding_1(code)) {
          returnState = tagOpenAttributeNameAfter;
          return atLineEnding(code)
        }

        if (markdownSpace_1(code)) {
          effects.consume(code);
          return tagOpenAttributeNameAfter
        }

        return tagOpenBetween(code)
      }

      function tagOpenAttributeValueBefore(code) {
        if (
          code === null ||
          code === 60 ||
          code === 61 ||
          code === 62 ||
          code === 96
        ) {
          return nok(code)
        }

        if (code === 34 || code === 39) {
          effects.consume(code);
          marker = code;
          return tagOpenAttributeValueQuoted
        }

        if (markdownLineEnding_1(code)) {
          returnState = tagOpenAttributeValueBefore;
          return atLineEnding(code)
        }

        if (markdownSpace_1(code)) {
          effects.consume(code);
          return tagOpenAttributeValueBefore
        }

        effects.consume(code);
        marker = undefined;
        return tagOpenAttributeValueUnquoted
      }

      function tagOpenAttributeValueQuoted(code) {
        if (code === marker) {
          effects.consume(code);
          return tagOpenAttributeValueQuotedAfter
        }

        if (code === null) {
          return nok(code)
        }

        if (markdownLineEnding_1(code)) {
          returnState = tagOpenAttributeValueQuoted;
          return atLineEnding(code)
        }

        effects.consume(code);
        return tagOpenAttributeValueQuoted
      }

      function tagOpenAttributeValueQuotedAfter(code) {
        if (code === 62 || code === 47 || markdownLineEndingOrSpace_1(code)) {
          return tagOpenBetween(code)
        }

        return nok(code)
      }

      function tagOpenAttributeValueUnquoted(code) {
        if (
          code === null ||
          code === 34 ||
          code === 39 ||
          code === 60 ||
          code === 61 ||
          code === 96
        ) {
          return nok(code)
        }

        if (code === 62 || markdownLineEndingOrSpace_1(code)) {
          return tagOpenBetween(code)
        }

        effects.consume(code);
        return tagOpenAttributeValueUnquoted
      } // We can’t have blank lines in content, so no need to worry about empty
      // tokens.

      function atLineEnding(code) {
        effects.exit('htmlTextData');
        effects.enter('lineEnding');
        effects.consume(code);
        effects.exit('lineEnding');
        return factorySpace(
          effects,
          afterPrefix,
          'linePrefix',
          self.parser.constructs.disable.null.indexOf('codeIndented') > -1
            ? undefined
            : 4
        )
      }

      function afterPrefix(code) {
        effects.enter('htmlTextData');
        return returnState(code)
      }

      function end(code) {
        if (code === 62) {
          effects.consume(code);
          effects.exit('htmlTextData');
          effects.exit('htmlText');
          return ok
        }

        return nok(code)
      }
    }

    var htmlText_1 = htmlText;

    var labelEnd = {
      name: 'labelEnd',
      tokenize: tokenizeLabelEnd,
      resolveTo: resolveToLabelEnd,
      resolveAll: resolveAllLabelEnd
    };
    var resourceConstruct = {
      tokenize: tokenizeResource
    };
    var fullReferenceConstruct = {
      tokenize: tokenizeFullReference
    };
    var collapsedReferenceConstruct = {
      tokenize: tokenizeCollapsedReference
    };

    function resolveAllLabelEnd(events) {
      var index = -1;
      var token;

      while (++index < events.length) {
        token = events[index][1];

        if (
          !token._used &&
          (token.type === 'labelImage' ||
            token.type === 'labelLink' ||
            token.type === 'labelEnd')
        ) {
          // Remove the marker.
          events.splice(index + 1, token.type === 'labelImage' ? 4 : 2);
          token.type = 'data';
          index++;
        }
      }

      return events
    }

    function resolveToLabelEnd(events, context) {
      var index = events.length;
      var offset = 0;
      var group;
      var label;
      var text;
      var token;
      var open;
      var close;
      var media; // Find an opening.

      while (index--) {
        token = events[index][1];

        if (open) {
          // If we see another link, or inactive link label, we’ve been here before.
          if (
            token.type === 'link' ||
            (token.type === 'labelLink' && token._inactive)
          ) {
            break
          } // Mark other link openings as inactive, as we can’t have links in
          // links.

          if (events[index][0] === 'enter' && token.type === 'labelLink') {
            token._inactive = true;
          }
        } else if (close) {
          if (
            events[index][0] === 'enter' &&
            (token.type === 'labelImage' || token.type === 'labelLink') &&
            !token._balanced
          ) {
            open = index;

            if (token.type !== 'labelLink') {
              offset = 2;
              break
            }
          }
        } else if (token.type === 'labelEnd') {
          close = index;
        }
      }

      group = {
        type: events[open][1].type === 'labelLink' ? 'link' : 'image',
        start: shallow_1(events[open][1].start),
        end: shallow_1(events[events.length - 1][1].end)
      };
      label = {
        type: 'label',
        start: shallow_1(events[open][1].start),
        end: shallow_1(events[close][1].end)
      };
      text = {
        type: 'labelText',
        start: shallow_1(events[open + offset + 2][1].end),
        end: shallow_1(events[close - 2][1].start)
      };
      media = [
        ['enter', group, context],
        ['enter', label, context]
      ]; // Opening marker.

      media = chunkedPush_1(media, events.slice(open + 1, open + offset + 3)); // Text open.

      media = chunkedPush_1(media, [['enter', text, context]]); // Between.

      media = chunkedPush_1(
        media,
        resolveAll_1(
          context.parser.constructs.insideSpan.null,
          events.slice(open + offset + 4, close - 3),
          context
        )
      ); // Text close, marker close, label close.

      media = chunkedPush_1(media, [
        ['exit', text, context],
        events[close - 2],
        events[close - 1],
        ['exit', label, context]
      ]); // Reference, resource, or so.

      media = chunkedPush_1(media, events.slice(close + 1)); // Media close.

      media = chunkedPush_1(media, [['exit', group, context]]);
      chunkedSplice_1(events, open, events.length, media);
      return events
    }

    function tokenizeLabelEnd(effects, ok, nok) {
      var self = this;
      var index = self.events.length;
      var labelStart;
      var defined; // Find an opening.

      while (index--) {
        if (
          (self.events[index][1].type === 'labelImage' ||
            self.events[index][1].type === 'labelLink') &&
          !self.events[index][1]._balanced
        ) {
          labelStart = self.events[index][1];
          break
        }
      }

      return start

      function start(code) {
        if (!labelStart) {
          return nok(code)
        } // It’s a balanced bracket, but contains a link.

        if (labelStart._inactive) return balanced(code)
        defined =
          self.parser.defined.indexOf(
            normalizeIdentifier_1(
              self.sliceSerialize({
                start: labelStart.end,
                end: self.now()
              })
            )
          ) > -1;
        effects.enter('labelEnd');
        effects.enter('labelMarker');
        effects.consume(code);
        effects.exit('labelMarker');
        effects.exit('labelEnd');
        return afterLabelEnd
      }

      function afterLabelEnd(code) {
        // Resource: `[asd](fgh)`.
        if (code === 40) {
          return effects.attempt(
            resourceConstruct,
            ok,
            defined ? ok : balanced
          )(code)
        } // Collapsed (`[asd][]`) or full (`[asd][fgh]`) reference?

        if (code === 91) {
          return effects.attempt(
            fullReferenceConstruct,
            ok,
            defined
              ? effects.attempt(collapsedReferenceConstruct, ok, balanced)
              : balanced
          )(code)
        } // Shortcut reference: `[asd]`?

        return defined ? ok(code) : balanced(code)
      }

      function balanced(code) {
        labelStart._balanced = true;
        return nok(code)
      }
    }

    function tokenizeResource(effects, ok, nok) {
      return start

      function start(code) {
        effects.enter('resource');
        effects.enter('resourceMarker');
        effects.consume(code);
        effects.exit('resourceMarker');
        return factoryWhitespace(effects, open)
      }

      function open(code) {
        if (code === 41) {
          return end(code)
        }

        return factoryDestination(
          effects,
          destinationAfter,
          nok,
          'resourceDestination',
          'resourceDestinationLiteral',
          'resourceDestinationLiteralMarker',
          'resourceDestinationRaw',
          'resourceDestinationString',
          3
        )(code)
      }

      function destinationAfter(code) {
        return markdownLineEndingOrSpace_1(code)
          ? factoryWhitespace(effects, between)(code)
          : end(code)
      }

      function between(code) {
        if (code === 34 || code === 39 || code === 40) {
          return factoryTitle(
            effects,
            factoryWhitespace(effects, end),
            nok,
            'resourceTitle',
            'resourceTitleMarker',
            'resourceTitleString'
          )(code)
        }

        return end(code)
      }

      function end(code) {
        if (code === 41) {
          effects.enter('resourceMarker');
          effects.consume(code);
          effects.exit('resourceMarker');
          effects.exit('resource');
          return ok
        }

        return nok(code)
      }
    }

    function tokenizeFullReference(effects, ok, nok) {
      var self = this;
      return start

      function start(code) {
        return factoryLabel.call(
          self,
          effects,
          afterLabel,
          nok,
          'reference',
          'referenceMarker',
          'referenceString'
        )(code)
      }

      function afterLabel(code) {
        return self.parser.defined.indexOf(
          normalizeIdentifier_1(
            self.sliceSerialize(self.events[self.events.length - 1][1]).slice(1, -1)
          )
        ) < 0
          ? nok(code)
          : ok(code)
      }
    }

    function tokenizeCollapsedReference(effects, ok, nok) {
      return start

      function start(code) {
        effects.enter('reference');
        effects.enter('referenceMarker');
        effects.consume(code);
        effects.exit('referenceMarker');
        return open
      }

      function open(code) {
        if (code === 93) {
          effects.enter('referenceMarker');
          effects.consume(code);
          effects.exit('referenceMarker');
          effects.exit('reference');
          return ok
        }

        return nok(code)
      }
    }

    var labelEnd_1 = labelEnd;

    var labelStartImage = {
      name: 'labelStartImage',
      tokenize: tokenizeLabelStartImage,
      resolveAll: labelEnd_1.resolveAll
    };

    function tokenizeLabelStartImage(effects, ok, nok) {
      var self = this;
      return start

      function start(code) {
        effects.enter('labelImage');
        effects.enter('labelImageMarker');
        effects.consume(code);
        effects.exit('labelImageMarker');
        return open
      }

      function open(code) {
        if (code === 91) {
          effects.enter('labelMarker');
          effects.consume(code);
          effects.exit('labelMarker');
          effects.exit('labelImage');
          return after
        }

        return nok(code)
      }

      function after(code) {
        /* c8 ignore next */
        return code === 94 &&
          /* c8 ignore next */
          '_hiddenFootnoteSupport' in self.parser.constructs
          ? /* c8 ignore next */
            nok(code)
          : ok(code)
      }
    }

    var labelStartImage_1 = labelStartImage;

    var labelStartLink = {
      name: 'labelStartLink',
      tokenize: tokenizeLabelStartLink,
      resolveAll: labelEnd_1.resolveAll
    };

    function tokenizeLabelStartLink(effects, ok, nok) {
      var self = this;
      return start

      function start(code) {
        effects.enter('labelLink');
        effects.enter('labelMarker');
        effects.consume(code);
        effects.exit('labelMarker');
        effects.exit('labelLink');
        return after
      }

      function after(code) {
        /* c8 ignore next */
        return code === 94 &&
          /* c8 ignore next */
          '_hiddenFootnoteSupport' in self.parser.constructs
          ? /* c8 ignore next */
            nok(code)
          : ok(code)
      }
    }

    var labelStartLink_1 = labelStartLink;

    var lineEnding = {
      name: 'lineEnding',
      tokenize: tokenizeLineEnding
    };

    function tokenizeLineEnding(effects, ok) {
      return start

      function start(code) {
        effects.enter('lineEnding');
        effects.consume(code);
        effects.exit('lineEnding');
        return factorySpace(effects, ok, 'linePrefix')
      }
    }

    var lineEnding_1 = lineEnding;

    var thematicBreak = {
      name: 'thematicBreak',
      tokenize: tokenizeThematicBreak
    };

    function tokenizeThematicBreak(effects, ok, nok) {
      var size = 0;
      var marker;
      return start

      function start(code) {
        effects.enter('thematicBreak');
        marker = code;
        return atBreak(code)
      }

      function atBreak(code) {
        if (code === marker) {
          effects.enter('thematicBreakSequence');
          return sequence(code)
        }

        if (markdownSpace_1(code)) {
          return factorySpace(effects, atBreak, 'whitespace')(code)
        }

        if (size < 3 || (code !== null && !markdownLineEnding_1(code))) {
          return nok(code)
        }

        effects.exit('thematicBreak');
        return ok(code)
      }

      function sequence(code) {
        if (code === marker) {
          effects.consume(code);
          size++;
          return sequence
        }

        effects.exit('thematicBreakSequence');
        return atBreak(code)
      }
    }

    var thematicBreak_1 = thematicBreak;

    var list = {
      name: 'list',
      tokenize: tokenizeListStart,
      continuation: {
        tokenize: tokenizeListContinuation
      },
      exit: tokenizeListEnd
    };
    var listItemPrefixWhitespaceConstruct = {
      tokenize: tokenizeListItemPrefixWhitespace,
      partial: true
    };
    var indentConstruct = {
      tokenize: tokenizeIndent,
      partial: true
    };

    function tokenizeListStart(effects, ok, nok) {
      var self = this;
      var initialSize = prefixSize_1(self.events, 'linePrefix');
      var size = 0;
      return start

      function start(code) {
        var kind =
          self.containerState.type ||
          (code === 42 || code === 43 || code === 45
            ? 'listUnordered'
            : 'listOrdered');

        if (
          kind === 'listUnordered'
            ? !self.containerState.marker || code === self.containerState.marker
            : asciiDigit_1(code)
        ) {
          if (!self.containerState.type) {
            self.containerState.type = kind;
            effects.enter(kind, {
              _container: true
            });
          }

          if (kind === 'listUnordered') {
            effects.enter('listItemPrefix');
            return code === 42 || code === 45
              ? effects.check(thematicBreak_1, nok, atMarker)(code)
              : atMarker(code)
          }

          if (!self.interrupt || code === 49) {
            effects.enter('listItemPrefix');
            effects.enter('listItemValue');
            return inside(code)
          }
        }

        return nok(code)
      }

      function inside(code) {
        if (asciiDigit_1(code) && ++size < 10) {
          effects.consume(code);
          return inside
        }

        if (
          (!self.interrupt || size < 2) &&
          (self.containerState.marker
            ? code === self.containerState.marker
            : code === 41 || code === 46)
        ) {
          effects.exit('listItemValue');
          return atMarker(code)
        }

        return nok(code)
      }

      function atMarker(code) {
        effects.enter('listItemMarker');
        effects.consume(code);
        effects.exit('listItemMarker');
        self.containerState.marker = self.containerState.marker || code;
        return effects.check(
          partialBlankLine_1, // Can’t be empty when interrupting.
          self.interrupt ? nok : onBlank,
          effects.attempt(
            listItemPrefixWhitespaceConstruct,
            endOfPrefix,
            otherPrefix
          )
        )
      }

      function onBlank(code) {
        self.containerState.initialBlankLine = true;
        initialSize++;
        return endOfPrefix(code)
      }

      function otherPrefix(code) {
        if (markdownSpace_1(code)) {
          effects.enter('listItemPrefixWhitespace');
          effects.consume(code);
          effects.exit('listItemPrefixWhitespace');
          return endOfPrefix
        }

        return nok(code)
      }

      function endOfPrefix(code) {
        self.containerState.size =
          initialSize + sizeChunks_1(self.sliceStream(effects.exit('listItemPrefix')));
        return ok(code)
      }
    }

    function tokenizeListContinuation(effects, ok, nok) {
      var self = this;
      self.containerState._closeFlow = undefined;
      return effects.check(partialBlankLine_1, onBlank, notBlank)

      function onBlank(code) {
        self.containerState.furtherBlankLines =
          self.containerState.furtherBlankLines ||
          self.containerState.initialBlankLine;
        return ok(code)
      }

      function notBlank(code) {
        if (self.containerState.furtherBlankLines || !markdownSpace_1(code)) {
          self.containerState.furtherBlankLines = self.containerState.initialBlankLine = undefined;
          return notInCurrentItem(code)
        }

        self.containerState.furtherBlankLines = self.containerState.initialBlankLine = undefined;
        return effects.attempt(indentConstruct, ok, notInCurrentItem)(code)
      }

      function notInCurrentItem(code) {
        // While we do continue, we signal that the flow should be closed.
        self.containerState._closeFlow = true; // As we’re closing flow, we’re no longer interrupting.

        self.interrupt = undefined;
        return factorySpace(
          effects,
          effects.attempt(list, ok, nok),
          'linePrefix',
          self.parser.constructs.disable.null.indexOf('codeIndented') > -1
            ? undefined
            : 4
        )(code)
      }
    }

    function tokenizeIndent(effects, ok, nok) {
      var self = this;
      return factorySpace(
        effects,
        afterPrefix,
        'listItemIndent',
        self.containerState.size + 1
      )

      function afterPrefix(code) {
        return prefixSize_1(self.events, 'listItemIndent') ===
          self.containerState.size
          ? ok(code)
          : nok(code)
      }
    }

    function tokenizeListEnd(effects) {
      effects.exit(this.containerState.type);
    }

    function tokenizeListItemPrefixWhitespace(effects, ok, nok) {
      var self = this;
      return factorySpace(
        effects,
        afterPrefix,
        'listItemPrefixWhitespace',
        self.parser.constructs.disable.null.indexOf('codeIndented') > -1
          ? undefined
          : 4 + 1
      )

      function afterPrefix(code) {
        return markdownSpace_1(code) ||
          !prefixSize_1(self.events, 'listItemPrefixWhitespace')
          ? nok(code)
          : ok(code)
      }
    }

    var list_1 = list;

    var setextUnderline = {
      name: 'setextUnderline',
      tokenize: tokenizeSetextUnderline,
      resolveTo: resolveToSetextUnderline
    };

    function resolveToSetextUnderline(events, context) {
      var index = events.length;
      var content;
      var text;
      var definition;
      var heading; // Find the opening of the content.
      // It’ll always exist: we don’t tokenize if it isn’t there.

      while (index--) {
        if (events[index][0] === 'enter') {
          if (events[index][1].type === 'content') {
            content = index;
            break
          }

          if (events[index][1].type === 'paragraph') {
            text = index;
          }
        } // Exit
        else {
          if (events[index][1].type === 'content') {
            // Remove the content end (if needed we’ll add it later)
            events.splice(index, 1);
          }

          if (!definition && events[index][1].type === 'definition') {
            definition = index;
          }
        }
      }

      heading = {
        type: 'setextHeading',
        start: shallow_1(events[text][1].start),
        end: shallow_1(events[events.length - 1][1].end)
      }; // Change the paragraph to setext heading text.

      events[text][1].type = 'setextHeadingText'; // If we have definitions in the content, we’ll keep on having content,
      // but we need move it.

      if (definition) {
        events.splice(text, 0, ['enter', heading, context]);
        events.splice(definition + 1, 0, ['exit', events[content][1], context]);
        events[content][1].end = shallow_1(events[definition][1].end);
      } else {
        events[content][1] = heading;
      } // Add the heading exit at the end.

      events.push(['exit', heading, context]);
      return events
    }

    function tokenizeSetextUnderline(effects, ok, nok) {
      var self = this;
      var index = self.events.length;
      var marker;
      var paragraph; // Find an opening.

      while (index--) {
        // Skip enter/exit of line ending, line prefix, and content.
        // We can now either have a definition or a paragraph.
        if (
          self.events[index][1].type !== 'lineEnding' &&
          self.events[index][1].type !== 'linePrefix' &&
          self.events[index][1].type !== 'content'
        ) {
          paragraph = self.events[index][1].type === 'paragraph';
          break
        }
      }

      return start

      function start(code) {
        if (!self.lazy && (self.interrupt || paragraph)) {
          effects.enter('setextHeadingLine');
          effects.enter('setextHeadingLineSequence');
          marker = code;
          return closingSequence(code)
        }

        return nok(code)
      }

      function closingSequence(code) {
        if (code === marker) {
          effects.consume(code);
          return closingSequence
        }

        effects.exit('setextHeadingLineSequence');
        return factorySpace(effects, closingSequenceEnd, 'lineSuffix')(code)
      }

      function closingSequenceEnd(code) {
        if (code === null || markdownLineEnding_1(code)) {
          effects.exit('setextHeadingLine');
          return ok(code)
        }

        return nok(code)
      }
    }

    var setextUnderline_1 = setextUnderline;

    var constructs$1 = createCommonjsModule(function (module, exports) {

    Object.defineProperty(exports, '__esModule', {value: true});























    var document = {
      42: list_1,
      // Asterisk
      43: list_1,
      // Plus sign
      45: list_1,
      // Dash
      48: list_1,
      // 0
      49: list_1,
      // 1
      50: list_1,
      // 2
      51: list_1,
      // 3
      52: list_1,
      // 4
      53: list_1,
      // 5
      54: list_1,
      // 6
      55: list_1,
      // 7
      56: list_1,
      // 8
      57: list_1,
      // 9
      62: blockQuote_1 // Greater than
    };
    var contentInitial = {
      91: definition_1 // Left square bracket
    };
    var flowInitial = {
      '-2': codeIndented_1,
      // Horizontal tab
      '-1': codeIndented_1,
      // Virtual space
      32: codeIndented_1 // Space
    };
    var flow = {
      35: headingAtx_1,
      // Number sign
      42: thematicBreak_1,
      // Asterisk
      45: [setextUnderline_1, thematicBreak_1],
      // Dash
      60: htmlFlow_1,
      // Less than
      61: setextUnderline_1,
      // Equals to
      95: thematicBreak_1,
      // Underscore
      96: codeFenced_1,
      // Grave accent
      126: codeFenced_1 // Tilde
    };
    var string = {
      38: characterReference_1,
      // Ampersand
      92: characterEscape_1 // Backslash
    };
    var text = {
      '-5': lineEnding_1,
      // Carriage return
      '-4': lineEnding_1,
      // Line feed
      '-3': lineEnding_1,
      // Carriage return + line feed
      33: labelStartImage_1,
      // Exclamation mark
      38: characterReference_1,
      // Ampersand
      42: attention_1,
      // Asterisk
      60: [autolink_1, htmlText_1],
      // Less than
      91: labelStartLink_1,
      // Left square bracket
      92: [hardBreakEscape_1, characterEscape_1],
      // Backslash
      93: labelEnd_1,
      // Right square bracket
      95: attention_1,
      // Underscore
      96: codeText_1 // Grave accent
    };
    var insideSpan = {
      null: [attention_1, text_1.resolver]
    };
    var disable = {
      null: []
    };

    exports.contentInitial = contentInitial;
    exports.disable = disable;
    exports.document = document;
    exports.flow = flow;
    exports.flowInitial = flowInitial;
    exports.insideSpan = insideSpan;
    exports.string = string;
    exports.text = text;
    });

    function parse(options) {
      var settings = options || {};
      var parser = {
        defined: [],
        constructs: combineExtensions_1(
          [constructs$1].concat(miniflat_1(settings.extensions))
        ),
        content: create(content),
        document: create(document$1),
        flow: create(flow),
        string: create(text_1.string),
        text: create(text_1.text)
      };
      return parser

      function create(initializer) {
        return creator

        function creator(from) {
          return createTokenizer_1(parser, initializer, from)
        }
      }
    }

    var parse_1 = parse;

    var search = /[\0\t\n\r]/g;

    function preprocess() {
      var start = true;
      var column = 1;
      var buffer = '';
      var atCarriageReturn;
      return preprocessor

      function preprocessor(value, encoding, end) {
        var chunks = [];
        var match;
        var next;
        var startPosition;
        var endPosition;
        var code;
        value = buffer + value.toString(encoding);
        startPosition = 0;
        buffer = '';

        if (start) {
          if (value.charCodeAt(0) === 65279) {
            startPosition++;
          }

          start = undefined;
        }

        while (startPosition < value.length) {
          search.lastIndex = startPosition;
          match = search.exec(value);
          endPosition = match ? match.index : value.length;
          code = value.charCodeAt(endPosition);

          if (!match) {
            buffer = value.slice(startPosition);
            break
          }

          if (code === 10 && startPosition === endPosition && atCarriageReturn) {
            chunks.push(-3);
            atCarriageReturn = undefined;
          } else {
            if (atCarriageReturn) {
              chunks.push(-5);
              atCarriageReturn = undefined;
            }

            if (startPosition < endPosition) {
              chunks.push(value.slice(startPosition, endPosition));
              column += endPosition - startPosition;
            }

            if (code === 0) {
              chunks.push(65533);
              column++;
            } else if (code === 9) {
              next = Math.ceil(column / 4) * 4;
              chunks.push(-2);

              while (column++ < next) chunks.push(-1);
            } else if (code === 10) {
              chunks.push(-4);
              column = 1;
            } // Must be carriage return.
            else {
              atCarriageReturn = true;
              column = 1;
            }
          }

          startPosition = endPosition + 1;
        }

        if (end) {
          if (atCarriageReturn) chunks.push(-5);
          if (buffer) chunks.push(buffer);
          chunks.push(null);
        }

        return chunks
      }
    }

    var preprocess_1 = preprocess;

    function postprocess(events) {
      while (!subtokenize_1(events)) {
        // Empty
      }

      return events
    }

    var postprocess_1 = postprocess;

    var dist = fromMarkdown;

    // These three are compiled away in the `dist/`












    function fromMarkdown(value, encoding, options) {
      if (typeof encoding !== 'string') {
        options = encoding;
        encoding = undefined;
      }

      return compiler(options)(
        postprocess_1(
          parse_1(options).document().write(preprocess_1()(value, encoding, true))
        )
      )
    }

    // Note this compiler only understand complete buffering, not streaming.
    function compiler(options) {
      var settings = options || {};
      var config = configure(
        {
          canContainEols: [
            'emphasis',
            'fragment',
            'heading',
            'paragraph',
            'strong'
          ],

          enter: {
            autolink: opener(link),
            autolinkProtocol: onenterdata,
            autolinkEmail: onenterdata,
            atxHeading: opener(heading),
            blockQuote: opener(blockQuote),
            characterEscape: onenterdata,
            characterReference: onenterdata,
            codeFenced: opener(codeFlow),
            codeFencedFenceInfo: buffer,
            codeFencedFenceMeta: buffer,
            codeIndented: opener(codeFlow, buffer),
            codeText: opener(codeText, buffer),
            codeTextData: onenterdata,
            data: onenterdata,
            codeFlowValue: onenterdata,
            definition: opener(definition),
            definitionDestinationString: buffer,
            definitionLabelString: buffer,
            definitionTitleString: buffer,
            emphasis: opener(emphasis),
            hardBreakEscape: opener(hardBreak),
            hardBreakTrailing: opener(hardBreak),
            htmlFlow: opener(html, buffer),
            htmlFlowData: onenterdata,
            htmlText: opener(html, buffer),
            htmlTextData: onenterdata,
            image: opener(image),
            label: buffer,
            link: opener(link),
            listItem: opener(listItem),
            listItemValue: onenterlistitemvalue,
            listOrdered: opener(list, onenterlistordered),
            listUnordered: opener(list),
            paragraph: opener(paragraph),
            reference: onenterreference,
            referenceString: buffer,
            resourceDestinationString: buffer,
            resourceTitleString: buffer,
            setextHeading: opener(heading),
            strong: opener(strong),
            thematicBreak: opener(thematicBreak)
          },

          exit: {
            atxHeading: closer(),
            atxHeadingSequence: onexitatxheadingsequence,
            autolink: closer(),
            autolinkEmail: onexitautolinkemail,
            autolinkProtocol: onexitautolinkprotocol,
            blockQuote: closer(),
            characterEscapeValue: onexitdata,
            characterReferenceMarkerHexadecimal: onexitcharacterreferencemarker,
            characterReferenceMarkerNumeric: onexitcharacterreferencemarker,
            characterReferenceValue: onexitcharacterreferencevalue,
            codeFenced: closer(onexitcodefenced),
            codeFencedFence: onexitcodefencedfence,
            codeFencedFenceInfo: onexitcodefencedfenceinfo,
            codeFencedFenceMeta: onexitcodefencedfencemeta,
            codeFlowValue: onexitdata,
            codeIndented: closer(onexitcodeindented),
            codeText: closer(onexitcodetext),
            codeTextData: onexitdata,
            data: onexitdata,
            definition: closer(),
            definitionDestinationString: onexitdefinitiondestinationstring,
            definitionLabelString: onexitdefinitionlabelstring,
            definitionTitleString: onexitdefinitiontitlestring,
            emphasis: closer(),
            hardBreakEscape: closer(onexithardbreak),
            hardBreakTrailing: closer(onexithardbreak),
            htmlFlow: closer(onexithtmlflow),
            htmlFlowData: onexitdata,
            htmlText: closer(onexithtmltext),
            htmlTextData: onexitdata,
            image: closer(onexitimage),
            label: onexitlabel,
            labelText: onexitlabeltext,
            lineEnding: onexitlineending,
            link: closer(onexitlink),
            listItem: closer(),
            listOrdered: closer(),
            listUnordered: closer(),
            paragraph: closer(),
            referenceString: onexitreferencestring,
            resourceDestinationString: onexitresourcedestinationstring,
            resourceTitleString: onexitresourcetitlestring,
            resource: onexitresource,
            setextHeading: closer(onexitsetextheading),
            setextHeadingLineSequence: onexitsetextheadinglinesequence,
            setextHeadingText: onexitsetextheadingtext,
            strong: closer(),
            thematicBreak: closer()
          }
        },

        settings.mdastExtensions || []
      );

      var data = {};

      return compile

      function compile(events) {
        var stack = [{type: 'root', children: []}];
        var tokenStack = [];
        var listStack = [];
        var index = -1;
        var handler;
        var listStart;

        var context = {
          stack: stack,
          tokenStack: tokenStack,
          config: config,
          enter: enter,
          exit: exit,
          buffer: buffer,
          resume: resume,
          setData: setData,
          getData: getData
        };

        while (++index < events.length) {
          // We preprocess lists to add `listItem` tokens, and to infer whether
          // items the list itself are spread out.
          if (
            events[index][1].type === 'listOrdered' ||
            events[index][1].type === 'listUnordered'
          ) {
            if (events[index][0] === 'enter') {
              listStack.push(index);
            } else {
              listStart = listStack.pop(index);
              index = prepareList(events, listStart, index);
            }
          }
        }

        index = -1;

        while (++index < events.length) {
          handler = config[events[index][0]];

          if (hasOwnProperty_1.call(handler, events[index][1].type)) {
            handler[events[index][1].type].call(
              assign_1({sliceSerialize: events[index][2].sliceSerialize}, context),
              events[index][1]
            );
          }
        }

        if (tokenStack.length) {
          throw new Error(
            'Cannot close document, a token (`' +
              tokenStack[tokenStack.length - 1].type +
              '`, ' +
              unistUtilStringifyPosition({
                start: tokenStack[tokenStack.length - 1].start,
                end: tokenStack[tokenStack.length - 1].end
              }) +
              ') is still open'
          )
        }

        // Figure out `root` position.
        stack[0].position = {
          start: point(
            events.length ? events[0][1].start : {line: 1, column: 1, offset: 0}
          ),

          end: point(
            events.length
              ? events[events.length - 2][1].end
              : {line: 1, column: 1, offset: 0}
          )
        };

        return stack[0]
      }

      function prepareList(events, start, length) {
        var index = start - 1;
        var containerBalance = -1;
        var listSpread = false;
        var listItem;
        var tailIndex;
        var lineIndex;
        var tailEvent;
        var event;
        var firstBlankLineIndex;
        var atMarker;

        while (++index <= length) {
          event = events[index];

          if (
            event[1].type === 'listUnordered' ||
            event[1].type === 'listOrdered' ||
            event[1].type === 'blockQuote'
          ) {
            if (event[0] === 'enter') {
              containerBalance++;
            } else {
              containerBalance--;
            }

            atMarker = undefined;
          } else if (event[1].type === 'lineEndingBlank') {
            if (event[0] === 'enter') {
              if (
                listItem &&
                !atMarker &&
                !containerBalance &&
                !firstBlankLineIndex
              ) {
                firstBlankLineIndex = index;
              }

              atMarker = undefined;
            }
          } else if (
            event[1].type === 'linePrefix' ||
            event[1].type === 'listItemValue' ||
            event[1].type === 'listItemMarker' ||
            event[1].type === 'listItemPrefix' ||
            event[1].type === 'listItemPrefixWhitespace'
          ) ; else {
            atMarker = undefined;
          }

          if (
            (!containerBalance &&
              event[0] === 'enter' &&
              event[1].type === 'listItemPrefix') ||
            (containerBalance === -1 &&
              event[0] === 'exit' &&
              (event[1].type === 'listUnordered' ||
                event[1].type === 'listOrdered'))
          ) {
            if (listItem) {
              tailIndex = index;
              lineIndex = undefined;

              while (tailIndex--) {
                tailEvent = events[tailIndex];

                if (
                  tailEvent[1].type === 'lineEnding' ||
                  tailEvent[1].type === 'lineEndingBlank'
                ) {
                  if (tailEvent[0] === 'exit') continue

                  if (lineIndex) {
                    events[lineIndex][1].type = 'lineEndingBlank';
                    listSpread = true;
                  }

                  tailEvent[1].type = 'lineEnding';
                  lineIndex = tailIndex;
                } else if (
                  tailEvent[1].type === 'linePrefix' ||
                  tailEvent[1].type === 'blockQuotePrefix' ||
                  tailEvent[1].type === 'blockQuotePrefixWhitespace' ||
                  tailEvent[1].type === 'blockQuoteMarker' ||
                  tailEvent[1].type === 'listItemIndent'
                ) ; else {
                  break
                }
              }

              if (
                firstBlankLineIndex &&
                (!lineIndex || firstBlankLineIndex < lineIndex)
              ) {
                listItem._spread = true;
              }

              // Fix position.
              listItem.end = point(
                lineIndex ? events[lineIndex][1].start : event[1].end
              );

              events.splice(lineIndex || index, 0, ['exit', listItem, event[2]]);
              index++;
              length++;
            }

            // Create a new list item.
            if (event[1].type === 'listItemPrefix') {
              listItem = {
                type: 'listItem',
                _spread: false,
                start: point(event[1].start)
              };

              events.splice(index, 0, ['enter', listItem, event[2]]);
              index++;
              length++;
              firstBlankLineIndex = undefined;
              atMarker = true;
            }
          }
        }

        events[start][1]._spread = listSpread;
        return length
      }

      function setData(key, value) {
        data[key] = value;
      }

      function getData(key) {
        return data[key]
      }

      function point(d) {
        return {line: d.line, column: d.column, offset: d.offset}
      }

      function opener(create, and) {
        return open

        function open(token) {
          enter.call(this, create(token), token);
          if (and) and.call(this, token);
        }
      }

      function buffer() {
        this.stack.push({type: 'fragment', children: []});
      }

      function enter(node, token) {
        this.stack[this.stack.length - 1].children.push(node);
        this.stack.push(node);
        this.tokenStack.push(token);
        node.position = {start: point(token.start)};
        return node
      }

      function closer(and) {
        return close

        function close(token) {
          if (and) and.call(this, token);
          exit.call(this, token);
        }
      }

      function exit(token) {
        var node = this.stack.pop();
        var open = this.tokenStack.pop();

        if (!open) {
          throw new Error(
            'Cannot close `' +
              token.type +
              '` (' +
              unistUtilStringifyPosition({start: token.start, end: token.end}) +
              '): it’s not open'
          )
        } else if (open.type !== token.type) {
          throw new Error(
            'Cannot close `' +
              token.type +
              '` (' +
              unistUtilStringifyPosition({start: token.start, end: token.end}) +
              '): a different token (`' +
              open.type +
              '`, ' +
              unistUtilStringifyPosition({start: open.start, end: open.end}) +
              ') is open'
          )
        }

        node.position.end = point(token.end);
        return node
      }

      function resume() {
        return mdastUtilToString(this.stack.pop())
      }

      //
      // Handlers.
      //

      function onenterlistordered() {
        setData('expectingFirstListItemValue', true);
      }

      function onenterlistitemvalue(token) {
        if (getData('expectingFirstListItemValue')) {
          this.stack[this.stack.length - 2].start = parseInt(
            this.sliceSerialize(token),
            10
          );

          setData('expectingFirstListItemValue');
        }
      }

      function onexitcodefencedfenceinfo() {
        var data = this.resume();
        this.stack[this.stack.length - 1].lang = data;
      }

      function onexitcodefencedfencemeta() {
        var data = this.resume();
        this.stack[this.stack.length - 1].meta = data;
      }

      function onexitcodefencedfence() {
        // Exit if this is the closing fence.
        if (getData('flowCodeInside')) return
        this.buffer();
        setData('flowCodeInside', true);
      }

      function onexitcodefenced() {
        var data = this.resume();
        this.stack[this.stack.length - 1].value = data.replace(
          /^(\r?\n|\r)|(\r?\n|\r)$/g,
          ''
        );

        setData('flowCodeInside');
      }

      function onexitcodeindented() {
        var data = this.resume();
        this.stack[this.stack.length - 1].value = data;
      }

      function onexitdefinitionlabelstring(token) {
        // Discard label, use the source content instead.
        var label = this.resume();
        this.stack[this.stack.length - 1].label = label;
        this.stack[this.stack.length - 1].identifier = normalizeIdentifier_1(
          this.sliceSerialize(token)
        ).toLowerCase();
      }

      function onexitdefinitiontitlestring() {
        var data = this.resume();
        this.stack[this.stack.length - 1].title = data;
      }

      function onexitdefinitiondestinationstring() {
        var data = this.resume();
        this.stack[this.stack.length - 1].url = data;
      }

      function onexitatxheadingsequence(token) {
        if (!this.stack[this.stack.length - 1].depth) {
          this.stack[this.stack.length - 1].depth = this.sliceSerialize(
            token
          ).length;
        }
      }

      function onexitsetextheadingtext() {
        setData('setextHeadingSlurpLineEnding', true);
      }

      function onexitsetextheadinglinesequence(token) {
        this.stack[this.stack.length - 1].depth =
          this.sliceSerialize(token).charCodeAt(0) === 61 ? 1 : 2;
      }

      function onexitsetextheading() {
        setData('setextHeadingSlurpLineEnding');
      }

      function onenterdata(token) {
        var siblings = this.stack[this.stack.length - 1].children;
        var tail = siblings[siblings.length - 1];

        if (!tail || tail.type !== 'text') {
          // Add a new text node.
          tail = text();
          tail.position = {start: point(token.start)};
          this.stack[this.stack.length - 1].children.push(tail);
        }

        this.stack.push(tail);
      }

      function onexitdata(token) {
        var tail = this.stack.pop();
        tail.value += this.sliceSerialize(token);
        tail.position.end = point(token.end);
      }

      function onexitlineending(token) {
        var context = this.stack[this.stack.length - 1];

        // If we’re at a hard break, include the line ending in there.
        if (getData('atHardBreak')) {
          context.children[context.children.length - 1].position.end = point(
            token.end
          );

          setData('atHardBreak');
          return
        }

        if (
          !getData('setextHeadingSlurpLineEnding') &&
          config.canContainEols.indexOf(context.type) > -1
        ) {
          onenterdata.call(this, token);
          onexitdata.call(this, token);
        }
      }

      function onexithardbreak() {
        setData('atHardBreak', true);
      }

      function onexithtmlflow() {
        var data = this.resume();
        this.stack[this.stack.length - 1].value = data;
      }

      function onexithtmltext() {
        var data = this.resume();
        this.stack[this.stack.length - 1].value = data;
      }

      function onexitcodetext() {
        var data = this.resume();
        this.stack[this.stack.length - 1].value = data;
      }

      function onexitlink() {
        var context = this.stack[this.stack.length - 1];

        // To do: clean.
        if (getData('inReference')) {
          context.type += 'Reference';
          context.referenceType = getData('referenceType') || 'shortcut';
          delete context.url;
          delete context.title;
        } else {
          delete context.identifier;
          delete context.label;
          delete context.referenceType;
        }

        setData('referenceType');
      }

      function onexitimage() {
        var context = this.stack[this.stack.length - 1];

        // To do: clean.
        if (getData('inReference')) {
          context.type += 'Reference';
          context.referenceType = getData('referenceType') || 'shortcut';
          delete context.url;
          delete context.title;
        } else {
          delete context.identifier;
          delete context.label;
          delete context.referenceType;
        }

        setData('referenceType');
      }

      function onexitlabeltext(token) {
        this.stack[this.stack.length - 2].identifier = normalizeIdentifier_1(
          this.sliceSerialize(token)
        ).toLowerCase();
      }

      function onexitlabel() {
        var fragment = this.stack[this.stack.length - 1];
        var value = this.resume();

        this.stack[this.stack.length - 1].label = value;

        // Assume a reference.
        setData('inReference', true);

        if (this.stack[this.stack.length - 1].type === 'link') {
          this.stack[this.stack.length - 1].children = fragment.children;
        } else {
          this.stack[this.stack.length - 1].alt = value;
        }
      }

      function onexitresourcedestinationstring() {
        var data = this.resume();
        this.stack[this.stack.length - 1].url = data;
      }

      function onexitresourcetitlestring() {
        var data = this.resume();
        this.stack[this.stack.length - 1].title = data;
      }

      function onexitresource() {
        setData('inReference');
      }

      function onenterreference() {
        setData('referenceType', 'collapsed');
      }

      function onexitreferencestring(token) {
        var label = this.resume();
        this.stack[this.stack.length - 1].label = label;
        this.stack[this.stack.length - 1].identifier = normalizeIdentifier_1(
          this.sliceSerialize(token)
        ).toLowerCase();
        setData('referenceType', 'full');
      }

      function onexitcharacterreferencemarker(token) {
        setData('characterReferenceType', token.type);
      }

      function onexitcharacterreferencevalue(token) {
        var data = this.sliceSerialize(token);
        var type = getData('characterReferenceType');
        var value;
        var tail;

        if (type) {
          value = safeFromInt_1(
            data,
            type === 'characterReferenceMarkerNumeric' ? 10 : 16
          );

          setData('characterReferenceType');
        } else {
          value = decodeEntity_browser(data);
        }

        tail = this.stack.pop();
        tail.value += value;
        tail.position.end = point(token.end);
      }

      function onexitautolinkprotocol(token) {
        onexitdata.call(this, token);
        this.stack[this.stack.length - 1].url = this.sliceSerialize(token);
      }

      function onexitautolinkemail(token) {
        onexitdata.call(this, token);
        this.stack[this.stack.length - 1].url =
          'mailto:' + this.sliceSerialize(token);
      }

      //
      // Creaters.
      //

      function blockQuote() {
        return {type: 'blockquote', children: []}
      }

      function codeFlow() {
        return {type: 'code', lang: null, meta: null, value: ''}
      }

      function codeText() {
        return {type: 'inlineCode', value: ''}
      }

      function definition() {
        return {
          type: 'definition',
          identifier: '',
          label: null,
          title: null,
          url: ''
        }
      }

      function emphasis() {
        return {type: 'emphasis', children: []}
      }

      function heading() {
        return {type: 'heading', depth: undefined, children: []}
      }

      function hardBreak() {
        return {type: 'break'}
      }

      function html() {
        return {type: 'html', value: ''}
      }

      function image() {
        return {type: 'image', title: null, url: '', alt: null}
      }

      function link() {
        return {type: 'link', title: null, url: '', children: []}
      }

      function list(token) {
        return {
          type: 'list',
          ordered: token.type === 'listOrdered',
          start: null,
          spread: token._spread,
          children: []
        }
      }

      function listItem(token) {
        return {
          type: 'listItem',
          spread: token._spread,
          checked: null,
          children: []
        }
      }

      function paragraph() {
        return {type: 'paragraph', children: []}
      }

      function strong() {
        return {type: 'strong', children: []}
      }

      function text() {
        return {type: 'text', value: ''}
      }

      function thematicBreak() {
        return {type: 'thematicBreak'}
      }
    }

    function configure(config, extensions) {
      var index = -1;

      while (++index < extensions.length) {
        extension$1(config, extensions[index]);
      }

      return config
    }

    function extension$1(config, extension) {
      var key;
      var left;

      for (key in extension) {
        left = hasOwnProperty_1.call(config, key) ? config[key] : (config[key] = {});

        if (key === 'canContainEols') {
          config[key] = [].concat(left, extension[key]);
        } else {
          Object.assign(left, extension[key]);
        }
      }
    }

    var mdastUtilFromMarkdown = dist;

    var remarkParse = parse$1;



    function parse$1(options) {
      var self = this;

      this.Parser = parse;

      function parse(doc) {
        return mdastUtilFromMarkdown(
          doc,
          Object.assign({}, self.data('settings'), options, {
            // Note: these options are not in the readme.
            // The goal is for them to be set by plugins on `data` instead of being
            // passed by users.
            extensions: self.data('micromarkExtensions') || [],
            mdastExtensions: self.data('fromMarkdownExtensions') || []
          })
        )
      }
    }

    var unistBuilder = u;

    function u(type, props, value) {
      var node;

      if (
        (value === null || value === undefined) &&
        (typeof props !== 'object' || Array.isArray(props))
      ) {
        value = props;
        props = {};
      }

      node = Object.assign({type: String(type)}, props);

      if (Array.isArray(value)) {
        node.children = value;
      } else if (value !== null && value !== undefined) {
        node.value = String(value);
      }

      return node
    }

    var convert_1 = convert;

    function convert(test) {
      if (test == null) {
        return ok
      }

      if (typeof test === 'string') {
        return typeFactory(test)
      }

      if (typeof test === 'object') {
        return 'length' in test ? anyFactory(test) : allFactory(test)
      }

      if (typeof test === 'function') {
        return test
      }

      throw new Error('Expected function, string, or object as test')
    }

    // Utility assert each property in `test` is represented in `node`, and each
    // values are strictly equal.
    function allFactory(test) {
      return all

      function all(node) {
        var key;

        for (key in test) {
          if (node[key] !== test[key]) return false
        }

        return true
      }
    }

    function anyFactory(tests) {
      var checks = [];
      var index = -1;

      while (++index < tests.length) {
        checks[index] = convert(tests[index]);
      }

      return any

      function any() {
        var index = -1;

        while (++index < checks.length) {
          if (checks[index].apply(this, arguments)) {
            return true
          }
        }

        return false
      }
    }

    // Utility to convert a string into a function which checks a given node’s type
    // for said string.
    function typeFactory(test) {
      return type

      function type(node) {
        return Boolean(node && node.type === test)
      }
    }

    // Utility to return true.
    function ok() {
      return true
    }

    var color_browser = identity;
    function identity(d) {
      return d
    }

    var unistUtilVisitParents = visitParents;




    var CONTINUE = true;
    var SKIP = 'skip';
    var EXIT = false;

    visitParents.CONTINUE = CONTINUE;
    visitParents.SKIP = SKIP;
    visitParents.EXIT = EXIT;

    function visitParents(tree, test, visitor, reverse) {
      var step;
      var is;

      if (typeof test === 'function' && typeof visitor !== 'function') {
        reverse = visitor;
        visitor = test;
        test = null;
      }

      is = convert_1(test);
      step = reverse ? -1 : 1;

      factory(tree, null, [])();

      function factory(node, index, parents) {
        var value = typeof node === 'object' && node !== null ? node : {};
        var name;

        if (typeof value.type === 'string') {
          name =
            typeof value.tagName === 'string'
              ? value.tagName
              : typeof value.name === 'string'
              ? value.name
              : undefined;

          visit.displayName =
            'node (' + color_browser(value.type + (name ? '<' + name + '>' : '')) + ')';
        }

        return visit

        function visit() {
          var grandparents = parents.concat(node);
          var result = [];
          var subresult;
          var offset;

          if (!test || is(node, index, parents[parents.length - 1] || null)) {
            result = toResult(visitor(node, parents));

            if (result[0] === EXIT) {
              return result
            }
          }

          if (node.children && result[0] !== SKIP) {
            offset = (reverse ? node.children.length : -1) + step;

            while (offset > -1 && offset < node.children.length) {
              subresult = factory(node.children[offset], offset, grandparents)();

              if (subresult[0] === EXIT) {
                return subresult
              }

              offset =
                typeof subresult[1] === 'number' ? subresult[1] : offset + step;
            }
          }

          return result
        }
      }
    }

    function toResult(value) {
      if (value !== null && typeof value === 'object' && 'length' in value) {
        return value
      }

      if (typeof value === 'number') {
        return [CONTINUE, value]
      }

      return [value]
    }

    var unistUtilVisit = visit;



    var CONTINUE$1 = unistUtilVisitParents.CONTINUE;
    var SKIP$1 = unistUtilVisitParents.SKIP;
    var EXIT$1 = unistUtilVisitParents.EXIT;

    visit.CONTINUE = CONTINUE$1;
    visit.SKIP = SKIP$1;
    visit.EXIT = EXIT$1;

    function visit(tree, test, visitor, reverse) {
      if (typeof test === 'function' && typeof visitor !== 'function') {
        reverse = visitor;
        visitor = test;
        test = null;
      }

      unistUtilVisitParents(tree, test, overload, reverse);

      function overload(node, parents) {
        var parent = parents[parents.length - 1];
        var index = parent ? parent.children.indexOf(node) : null;
        return visitor(node, index, parent)
      }
    }

    var start = factory('start');
    var end = factory('end');

    var unistUtilPosition = position$1;

    position$1.start = start;
    position$1.end = end;

    function position$1(node) {
      return {start: start(node), end: end(node)}
    }

    function factory(type) {
      point.displayName = type;

      return point

      function point(node) {
        var point = (node && node.position && node.position[type]) || {};

        return {
          line: point.line || null,
          column: point.column || null,
          offset: isNaN(point.offset) ? null : point.offset
        }
      }
    }

    var unistUtilGenerated = generated;

    function generated(node) {
      return (
        !node ||
        !node.position ||
        !node.position.start ||
        !node.position.start.line ||
        !node.position.start.column ||
        !node.position.end ||
        !node.position.end.line ||
        !node.position.end.column
      )
    }

    var mdastUtilDefinitions = getDefinitionFactory;

    var own$4 = {}.hasOwnProperty;

    // Get a definition in `node` by `identifier`.
    function getDefinitionFactory(node, options) {
      return getterFactory(gather(node))
    }

    // Gather all definitions in `node`
    function gather(node) {
      var cache = {};

      if (!node || !node.type) {
        throw new Error('mdast-util-definitions expected node')
      }

      unistUtilVisit(node, 'definition', ondefinition);

      return cache

      function ondefinition(definition) {
        var id = normalise(definition.identifier);
        if (!own$4.call(cache, id)) {
          cache[id] = definition;
        }
      }
    }

    // Factory to get a node from the given definition-cache.
    function getterFactory(cache) {
      return getter

      // Get a node from the bound definition-cache.
      function getter(identifier) {
        var id = identifier && normalise(identifier);
        return id && own$4.call(cache, id) ? cache[id] : null
      }
    }

    function normalise(identifier) {
      return identifier.toUpperCase()
    }

    var all_1 = all$1;



    function all$1(h, parent) {
      var nodes = parent.children || [];
      var length = nodes.length;
      var values = [];
      var index = -1;
      var result;
      var head;

      while (++index < length) {
        result = one_1(h, nodes[index], parent);

        if (result) {
          if (index && nodes[index - 1].type === 'break') {
            if (result.value) {
              result.value = result.value.replace(/^\s+/, '');
            }

            head = result.children && result.children[0];

            if (head && head.value) {
              head.value = head.value.replace(/^\s+/, '');
            }
          }

          values = values.concat(result);
        }
      }

      return values
    }

    var one_1 = one;




    var own$5 = {}.hasOwnProperty;

    // Transform an unknown node.
    function unknown(h, node) {
      if (text$1(node)) {
        return h.augment(node, unistBuilder('text', node.value))
      }

      return h(node, 'div', all_1(h, node))
    }

    // Visit a node.
    function one(h, node, parent) {
      var type = node && node.type;
      var fn;

      // Fail on non-nodes.
      if (!type) {
        throw new Error('Expected node, got `' + node + '`')
      }

      if (own$5.call(h.handlers, type)) {
        fn = h.handlers[type];
      } else if (h.passThrough && h.passThrough.indexOf(type) > -1) {
        fn = returnNode;
      } else {
        fn = h.unknownHandler;
      }

      return (typeof fn === 'function' ? fn : unknown)(h, node, parent)
    }

    // Check if the node should be renderered as a text node.
    function text$1(node) {
      var data = node.data || {};

      if (
        own$5.call(data, 'hName') ||
        own$5.call(data, 'hProperties') ||
        own$5.call(data, 'hChildren')
      ) {
        return false
      }

      return 'value' in node
    }

    function returnNode(h, node) {
      var clone;

      if (node.children) {
        clone = Object.assign({}, node);
        clone.children = all_1(h, node);
        return clone
      }

      return node
    }

    var thematicBreak_1$1 = thematicBreak$1;

    function thematicBreak$1(h, node) {
      return h(node, 'hr')
    }

    var wrap_1$1 = wrap$1;



    // Wrap `nodes` with line feeds between each entry.
    // Optionally adds line feeds at the start and end.
    function wrap$1(nodes, loose) {
      var result = [];
      var index = -1;
      var length = nodes.length;

      if (loose) {
        result.push(unistBuilder('text', '\n'));
      }

      while (++index < length) {
        if (index) {
          result.push(unistBuilder('text', '\n'));
        }

        result.push(nodes[index]);
      }

      if (loose && nodes.length > 0) {
        result.push(unistBuilder('text', '\n'));
      }

      return result
    }

    var list_1$1 = list$1;




    function list$1(h, node) {
      var props = {};
      var name = node.ordered ? 'ol' : 'ul';
      var items;
      var index = -1;
      var length;

      if (typeof node.start === 'number' && node.start !== 1) {
        props.start = node.start;
      }

      items = all_1(h, node);
      length = items.length;

      // Like GitHub, add a class for custom styling.
      while (++index < length) {
        if (
          items[index].properties.className &&
          items[index].properties.className.indexOf('task-list-item') !== -1
        ) {
          props.className = ['contains-task-list'];
          break
        }
      }

      return h(node, name, props, wrap_1$1(items, true))
    }

    var footer = generateFootnotes;





    function generateFootnotes(h) {
      var footnoteById = h.footnoteById;
      var footnoteOrder = h.footnoteOrder;
      var length = footnoteOrder.length;
      var index = -1;
      var listItems = [];
      var def;
      var backReference;
      var content;
      var tail;

      while (++index < length) {
        def = footnoteById[footnoteOrder[index].toUpperCase()];

        if (!def) {
          continue
        }

        content = def.children.concat();
        tail = content[content.length - 1];
        backReference = {
          type: 'link',
          url: '#fnref-' + def.identifier,
          data: {hProperties: {className: ['footnote-backref']}},
          children: [{type: 'text', value: '↩'}]
        };

        if (!tail || tail.type !== 'paragraph') {
          tail = {type: 'paragraph', children: []};
          content.push(tail);
        }

        tail.children.push(backReference);

        listItems.push({
          type: 'listItem',
          data: {hProperties: {id: 'fn-' + def.identifier}},
          children: content,
          position: def.position
        });
      }

      if (listItems.length === 0) {
        return null
      }

      return h(
        null,
        'div',
        {className: ['footnotes']},
        wrap_1$1(
          [
            thematicBreak_1$1(h),
            list_1$1(h, {type: 'list', ordered: true, children: listItems})
          ],
          true
        )
      )
    }

    var blockquote_1 = blockquote;




    function blockquote(h, node) {
      return h(node, 'blockquote', wrap_1$1(all_1(h, node), true))
    }

    var _break = hardBreak;



    function hardBreak(h, node) {
      return [h(node, 'br'), unistBuilder('text', '\n')]
    }

    var code_1 = code;



    function code(h, node) {
      var value = node.value ? node.value + '\n' : '';
      var lang = node.lang && node.lang.match(/^[^ \t]+(?=[ \t]|$)/);
      var props = {};

      if (lang) {
        props.className = ['language-' + lang];
      }

      return h(node.position, 'pre', [h(node, 'code', props, [unistBuilder('text', value)])])
    }

    var _delete = strikethrough;



    function strikethrough(h, node) {
      return h(node, 'del', all_1(h, node))
    }

    var emphasis_1 = emphasis;



    function emphasis(h, node) {
      return h(node, 'em', all_1(h, node))
    }

    var footnoteReference_1 = footnoteReference;



    function footnoteReference(h, node) {
      var footnoteOrder = h.footnoteOrder;
      var identifier = String(node.identifier);

      if (footnoteOrder.indexOf(identifier) === -1) {
        footnoteOrder.push(identifier);
      }

      return h(node.position, 'sup', {id: 'fnref-' + identifier}, [
        h(node, 'a', {href: '#fn-' + identifier, className: ['footnote-ref']}, [
          unistBuilder('text', node.label || identifier)
        ])
      ])
    }

    var footnote_1 = footnote;



    function footnote(h, node) {
      var footnoteById = h.footnoteById;
      var footnoteOrder = h.footnoteOrder;
      var identifier = 1;

      while (identifier in footnoteById) {
        identifier++;
      }

      identifier = String(identifier);

      // No need to check if `identifier` exists in `footnoteOrder`, it’s guaranteed
      // to not exist because we just generated it.
      footnoteOrder.push(identifier);

      footnoteById[identifier] = {
        type: 'footnoteDefinition',
        identifier: identifier,
        children: [{type: 'paragraph', children: node.children}],
        position: node.position
      };

      return footnoteReference_1(h, {
        type: 'footnoteReference',
        identifier: identifier,
        position: node.position
      })
    }

    var heading_1 = heading;



    function heading(h, node) {
      return h(node, 'h' + node.depth, all_1(h, node))
    }

    var html_1 = html;



    // Return either a `raw` node in dangerous mode, otherwise nothing.
    function html(h, node) {
      return h.dangerous ? h.augment(node, unistBuilder('raw', node.value)) : null
    }

    var encodeCache = {};


    // Create a lookup array where anything but characters in `chars` string
    // and alphanumeric chars is percent-encoded.
    //
    function getEncodeCache(exclude) {
      var i, ch, cache = encodeCache[exclude];
      if (cache) { return cache; }

      cache = encodeCache[exclude] = [];

      for (i = 0; i < 128; i++) {
        ch = String.fromCharCode(i);

        if (/^[0-9a-z]$/i.test(ch)) {
          // always allow unencoded alphanumeric characters
          cache.push(ch);
        } else {
          cache.push('%' + ('0' + i.toString(16).toUpperCase()).slice(-2));
        }
      }

      for (i = 0; i < exclude.length; i++) {
        cache[exclude.charCodeAt(i)] = exclude[i];
      }

      return cache;
    }


    // Encode unsafe characters with percent-encoding, skipping already
    // encoded sequences.
    //
    //  - string       - string to encode
    //  - exclude      - list of characters to ignore (in addition to a-zA-Z0-9)
    //  - keepEscaped  - don't encode '%' in a correct escape sequence (default: true)
    //
    function encode(string, exclude, keepEscaped) {
      var i, l, code, nextCode, cache,
          result = '';

      if (typeof exclude !== 'string') {
        // encode(string, keepEscaped)
        keepEscaped  = exclude;
        exclude = encode.defaultChars;
      }

      if (typeof keepEscaped === 'undefined') {
        keepEscaped = true;
      }

      cache = getEncodeCache(exclude);

      for (i = 0, l = string.length; i < l; i++) {
        code = string.charCodeAt(i);

        if (keepEscaped && code === 0x25 /* % */ && i + 2 < l) {
          if (/^[0-9a-f]{2}$/i.test(string.slice(i + 1, i + 3))) {
            result += string.slice(i, i + 3);
            i += 2;
            continue;
          }
        }

        if (code < 128) {
          result += cache[code];
          continue;
        }

        if (code >= 0xD800 && code <= 0xDFFF) {
          if (code >= 0xD800 && code <= 0xDBFF && i + 1 < l) {
            nextCode = string.charCodeAt(i + 1);
            if (nextCode >= 0xDC00 && nextCode <= 0xDFFF) {
              result += encodeURIComponent(string[i] + string[i + 1]);
              i++;
              continue;
            }
          }
          result += '%EF%BF%BD';
          continue;
        }

        result += encodeURIComponent(string[i]);
      }

      return result;
    }

    encode.defaultChars   = ";/?:@&=+$,-_.!~*'()#";
    encode.componentChars = "-_.!~*'()";


    var encode_1 = encode;

    var revert_1 = revert;




    // Return the content of a reference without definition as Markdown.
    function revert(h, node) {
      var subtype = node.referenceType;
      var suffix = ']';
      var contents;
      var head;
      var tail;

      if (subtype === 'collapsed') {
        suffix += '[]';
      } else if (subtype === 'full') {
        suffix += '[' + (node.label || node.identifier) + ']';
      }

      if (node.type === 'imageReference') {
        return unistBuilder('text', '![' + node.alt + suffix)
      }

      contents = all_1(h, node);
      head = contents[0];

      if (head && head.type === 'text') {
        head.value = '[' + head.value;
      } else {
        contents.unshift(unistBuilder('text', '['));
      }

      tail = contents[contents.length - 1];

      if (tail && tail.type === 'text') {
        tail.value += suffix;
      } else {
        contents.push(unistBuilder('text', suffix));
      }

      return contents
    }

    var imageReference_1 = imageReference;




    function imageReference(h, node) {
      var def = h.definition(node.identifier);
      var props;

      if (!def) {
        return revert_1(h, node)
      }

      props = {src: encode_1(def.url || ''), alt: node.alt};

      if (def.title !== null && def.title !== undefined) {
        props.title = def.title;
      }

      return h(node, 'img', props)
    }

    var image_1 = image;

    function image(h, node) {
      var props = {src: encode_1(node.url), alt: node.alt};

      if (node.title !== null && node.title !== undefined) {
        props.title = node.title;
      }

      return h(node, 'img', props)
    }

    var inlineCode_1 = inlineCode;



    function inlineCode(h, node) {
      var value = node.value.replace(/\r?\n|\r/g, ' ');
      return h(node, 'code', [unistBuilder('text', value)])
    }

    var linkReference_1 = linkReference;





    function linkReference(h, node) {
      var def = h.definition(node.identifier);
      var props;

      if (!def) {
        return revert_1(h, node)
      }

      props = {href: encode_1(def.url || '')};

      if (def.title !== null && def.title !== undefined) {
        props.title = def.title;
      }

      return h(node, 'a', props, all_1(h, node))
    }

    var link_1 = link;

    function link(h, node) {
      var props = {href: encode_1(node.url)};

      if (node.title !== null && node.title !== undefined) {
        props.title = node.title;
      }

      return h(node, 'a', props, all_1(h, node))
    }

    var listItem_1 = listItem;




    function listItem(h, node, parent) {
      var result = all_1(h, node);
      var head = result[0];
      var loose = parent ? listLoose(parent) : listItemLoose(node);
      var props = {};
      var wrapped = [];
      var length;
      var index;
      var child;

      if (typeof node.checked === 'boolean') {
        if (!head || head.tagName !== 'p') {
          head = h(null, 'p', []);
          result.unshift(head);
        }

        if (head.children.length > 0) {
          head.children.unshift(unistBuilder('text', ' '));
        }

        head.children.unshift(
          h(null, 'input', {
            type: 'checkbox',
            checked: node.checked,
            disabled: true
          })
        );

        // According to github-markdown-css, this class hides bullet.
        // See: <https://github.com/sindresorhus/github-markdown-css>.
        props.className = ['task-list-item'];
      }

      length = result.length;
      index = -1;

      while (++index < length) {
        child = result[index];

        // Add eols before nodes, except if this is a loose, first paragraph.
        if (loose || index !== 0 || child.tagName !== 'p') {
          wrapped.push(unistBuilder('text', '\n'));
        }

        if (child.tagName === 'p' && !loose) {
          wrapped = wrapped.concat(child.children);
        } else {
          wrapped.push(child);
        }
      }

      // Add a final eol.
      if (length && (loose || child.tagName !== 'p')) {
        wrapped.push(unistBuilder('text', '\n'));
      }

      return h(node, 'li', props, wrapped)
    }

    function listLoose(node) {
      var loose = node.spread;
      var children = node.children;
      var length = children.length;
      var index = -1;

      while (!loose && ++index < length) {
        loose = listItemLoose(children[index]);
      }

      return loose
    }

    function listItemLoose(node) {
      var spread = node.spread;

      return spread === undefined || spread === null
        ? node.children.length > 1
        : spread
    }

    var paragraph_1 = paragraph;



    function paragraph(h, node) {
      return h(node, 'p', all_1(h, node))
    }

    var root_1 = root;





    function root(h, node) {
      return h.augment(node, unistBuilder('root', wrap_1$1(all_1(h, node))))
    }

    var strong_1 = strong;



    function strong(h, node) {
      return h(node, 'strong', all_1(h, node))
    }

    var table_1 = table;





    function table(h, node) {
      var rows = node.children;
      var index = rows.length;
      var align = node.align || [];
      var alignLength = align.length;
      var result = [];
      var pos;
      var row;
      var out;
      var name;
      var cell;

      while (index--) {
        row = rows[index].children;
        name = index === 0 ? 'th' : 'td';
        pos = alignLength || row.length;
        out = [];

        while (pos--) {
          cell = row[pos];
          out[pos] = h(cell, name, {align: align[pos]}, cell ? all_1(h, cell) : []);
        }

        result[index] = h(rows[index], 'tr', wrap_1$1(out, true));
      }

      return h(
        node,
        'table',
        wrap_1$1(
          [h(result[0].position, 'thead', wrap_1$1([result[0]], true))].concat(
            result[1]
              ? h(
                  {
                    start: unistUtilPosition.start(result[1]),
                    end: unistUtilPosition.end(result[result.length - 1])
                  },
                  'tbody',
                  wrap_1$1(result.slice(1), true)
                )
              : []
          ),
          true
        )
      )
    }

    var text_1$1 = text$2;



    function text$2(h, node) {
      return h.augment(
        node,
        unistBuilder('text', String(node.value).replace(/[ \t]*(\r?\n|\r)[ \t]*/g, '$1'))
      )
    }

    var handlers = {
      blockquote: blockquote_1,
      break: _break,
      code: code_1,
      delete: _delete,
      emphasis: emphasis_1,
      footnoteReference: footnoteReference_1,
      footnote: footnote_1,
      heading: heading_1,
      html: html_1,
      imageReference: imageReference_1,
      image: image_1,
      inlineCode: inlineCode_1,
      linkReference: linkReference_1,
      link: link_1,
      listItem: listItem_1,
      list: list_1$1,
      paragraph: paragraph_1,
      root: root_1,
      strong: strong_1,
      table: table_1,
      text: text_1$1,
      thematicBreak: thematicBreak_1$1,
      toml: ignore,
      yaml: ignore,
      definition: ignore,
      footnoteDefinition: ignore
    };

    // Return nothing for nodes that are ignored.
    function ignore() {
      return null
    }

    var lib$1 = toHast;










    var own$6 = {}.hasOwnProperty;

    var deprecationWarningIssued = false;

    // Factory to transform.
    function factory$1(tree, options) {
      var settings = options || {};

      // Issue a warning if the deprecated tag 'allowDangerousHTML' is used
      if (settings.allowDangerousHTML !== undefined && !deprecationWarningIssued) {
        deprecationWarningIssued = true;
        console.warn(
          'mdast-util-to-hast: deprecation: `allowDangerousHTML` is nonstandard, use `allowDangerousHtml` instead'
        );
      }

      var dangerous = settings.allowDangerousHtml || settings.allowDangerousHTML;
      var footnoteById = {};

      h.dangerous = dangerous;
      h.definition = mdastUtilDefinitions(tree);
      h.footnoteById = footnoteById;
      h.footnoteOrder = [];
      h.augment = augment;
      h.handlers = Object.assign({}, handlers, settings.handlers);
      h.unknownHandler = settings.unknownHandler;
      h.passThrough = settings.passThrough;

      unistUtilVisit(tree, 'footnoteDefinition', onfootnotedefinition);

      return h

      // Finalise the created `right`, a hast node, from `left`, an mdast node.
      function augment(left, right) {
        var data;
        var ctx;

        // Handle `data.hName`, `data.hProperties, `data.hChildren`.
        if (left && left.data) {
          data = left.data;

          if (data.hName) {
            if (right.type !== 'element') {
              right = {
                type: 'element',
                tagName: '',
                properties: {},
                children: []
              };
            }

            right.tagName = data.hName;
          }

          if (right.type === 'element' && data.hProperties) {
            right.properties = Object.assign({}, right.properties, data.hProperties);
          }

          if (right.children && data.hChildren) {
            right.children = data.hChildren;
          }
        }

        ctx = left && left.position ? left : {position: left};

        if (!unistUtilGenerated(ctx)) {
          right.position = {
            start: unistUtilPosition.start(ctx),
            end: unistUtilPosition.end(ctx)
          };
        }

        return right
      }

      // Create an element for `node`.
      function h(node, tagName, props, children) {
        if (
          (children === undefined || children === null) &&
          typeof props === 'object' &&
          'length' in props
        ) {
          children = props;
          props = {};
        }

        return augment(node, {
          type: 'element',
          tagName: tagName,
          properties: props || {},
          children: children || []
        })
      }

      function onfootnotedefinition(definition) {
        var id = String(definition.identifier).toUpperCase();

        // Mimick CM behavior of link definitions.
        // See: <https://github.com/syntax-tree/mdast-util-definitions/blob/8290999/index.js#L26>.
        if (!own$6.call(footnoteById, id)) {
          footnoteById[id] = definition;
        }
      }
    }

    // Transform `tree`, which is an mdast node, to a hast node.
    function toHast(tree, options) {
      var h = factory$1(tree, options);
      var node = one_1(h, tree);
      var foot = footer(h);

      if (foot) {
        node.children = node.children.concat(unistBuilder('text', '\n'), foot);
      }

      return node
    }

    var mdastUtilToHast = lib$1;

    var remarkRehype = remark2rehype;

    // Attacher.
    // If a destination is given, runs the destination with the new hast tree
    // (bridge mode).
    // Without destination, returns the tree: further plugins run on that tree
    // (mutate mode).
    function remark2rehype(destination, options) {
      if (destination && !destination.process) {
        options = destination;
        destination = null;
      }

      return destination ? bridge(destination, options) : mutate(options)
    }

    // Bridge mode.
    // Runs the destination with the new hast tree.
    function bridge(destination, options) {
      return transformer

      function transformer(node, file, next) {
        destination.run(mdastUtilToHast(node, options), file, done);

        function done(err) {
          next(err);
        }
      }
    }

    // Mutate-mode.
    // Further transformers run on the hast tree.
    function mutate(options) {
      return transformer

      function transformer(node) {
        return mdastUtilToHast(node, options)
      }
    }

    const UNDEFINED_CODE_POINTS = [
        0xfffe,
        0xffff,
        0x1fffe,
        0x1ffff,
        0x2fffe,
        0x2ffff,
        0x3fffe,
        0x3ffff,
        0x4fffe,
        0x4ffff,
        0x5fffe,
        0x5ffff,
        0x6fffe,
        0x6ffff,
        0x7fffe,
        0x7ffff,
        0x8fffe,
        0x8ffff,
        0x9fffe,
        0x9ffff,
        0xafffe,
        0xaffff,
        0xbfffe,
        0xbffff,
        0xcfffe,
        0xcffff,
        0xdfffe,
        0xdffff,
        0xefffe,
        0xeffff,
        0xffffe,
        0xfffff,
        0x10fffe,
        0x10ffff
    ];

    var REPLACEMENT_CHARACTER = '\uFFFD';

    var CODE_POINTS = {
        EOF: -1,
        NULL: 0x00,
        TABULATION: 0x09,
        CARRIAGE_RETURN: 0x0d,
        LINE_FEED: 0x0a,
        FORM_FEED: 0x0c,
        SPACE: 0x20,
        EXCLAMATION_MARK: 0x21,
        QUOTATION_MARK: 0x22,
        NUMBER_SIGN: 0x23,
        AMPERSAND: 0x26,
        APOSTROPHE: 0x27,
        HYPHEN_MINUS: 0x2d,
        SOLIDUS: 0x2f,
        DIGIT_0: 0x30,
        DIGIT_9: 0x39,
        SEMICOLON: 0x3b,
        LESS_THAN_SIGN: 0x3c,
        EQUALS_SIGN: 0x3d,
        GREATER_THAN_SIGN: 0x3e,
        QUESTION_MARK: 0x3f,
        LATIN_CAPITAL_A: 0x41,
        LATIN_CAPITAL_F: 0x46,
        LATIN_CAPITAL_X: 0x58,
        LATIN_CAPITAL_Z: 0x5a,
        RIGHT_SQUARE_BRACKET: 0x5d,
        GRAVE_ACCENT: 0x60,
        LATIN_SMALL_A: 0x61,
        LATIN_SMALL_F: 0x66,
        LATIN_SMALL_X: 0x78,
        LATIN_SMALL_Z: 0x7a,
        REPLACEMENT_CHARACTER: 0xfffd
    };

    var CODE_POINT_SEQUENCES = {
        DASH_DASH_STRING: [0x2d, 0x2d], //--
        DOCTYPE_STRING: [0x44, 0x4f, 0x43, 0x54, 0x59, 0x50, 0x45], //DOCTYPE
        CDATA_START_STRING: [0x5b, 0x43, 0x44, 0x41, 0x54, 0x41, 0x5b], //[CDATA[
        SCRIPT_STRING: [0x73, 0x63, 0x72, 0x69, 0x70, 0x74], //script
        PUBLIC_STRING: [0x50, 0x55, 0x42, 0x4c, 0x49, 0x43], //PUBLIC
        SYSTEM_STRING: [0x53, 0x59, 0x53, 0x54, 0x45, 0x4d] //SYSTEM
    };

    //Surrogates
    var isSurrogate = function(cp) {
        return cp >= 0xd800 && cp <= 0xdfff;
    };

    var isSurrogatePair = function(cp) {
        return cp >= 0xdc00 && cp <= 0xdfff;
    };

    var getSurrogatePairCodePoint = function(cp1, cp2) {
        return (cp1 - 0xd800) * 0x400 + 0x2400 + cp2;
    };

    //NOTE: excluding NULL and ASCII whitespace
    var isControlCodePoint = function(cp) {
        return (
            (cp !== 0x20 && cp !== 0x0a && cp !== 0x0d && cp !== 0x09 && cp !== 0x0c && cp >= 0x01 && cp <= 0x1f) ||
            (cp >= 0x7f && cp <= 0x9f)
        );
    };

    var isUndefinedCodePoint = function(cp) {
        return (cp >= 0xfdd0 && cp <= 0xfdef) || UNDEFINED_CODE_POINTS.indexOf(cp) > -1;
    };

    var unicode = {
    	REPLACEMENT_CHARACTER: REPLACEMENT_CHARACTER,
    	CODE_POINTS: CODE_POINTS,
    	CODE_POINT_SEQUENCES: CODE_POINT_SEQUENCES,
    	isSurrogate: isSurrogate,
    	isSurrogatePair: isSurrogatePair,
    	getSurrogatePairCodePoint: getSurrogatePairCodePoint,
    	isControlCodePoint: isControlCodePoint,
    	isUndefinedCodePoint: isUndefinedCodePoint
    };

    var errorCodes = {
        controlCharacterInInputStream: 'control-character-in-input-stream',
        noncharacterInInputStream: 'noncharacter-in-input-stream',
        surrogateInInputStream: 'surrogate-in-input-stream',
        nonVoidHtmlElementStartTagWithTrailingSolidus: 'non-void-html-element-start-tag-with-trailing-solidus',
        endTagWithAttributes: 'end-tag-with-attributes',
        endTagWithTrailingSolidus: 'end-tag-with-trailing-solidus',
        unexpectedSolidusInTag: 'unexpected-solidus-in-tag',
        unexpectedNullCharacter: 'unexpected-null-character',
        unexpectedQuestionMarkInsteadOfTagName: 'unexpected-question-mark-instead-of-tag-name',
        invalidFirstCharacterOfTagName: 'invalid-first-character-of-tag-name',
        unexpectedEqualsSignBeforeAttributeName: 'unexpected-equals-sign-before-attribute-name',
        missingEndTagName: 'missing-end-tag-name',
        unexpectedCharacterInAttributeName: 'unexpected-character-in-attribute-name',
        unknownNamedCharacterReference: 'unknown-named-character-reference',
        missingSemicolonAfterCharacterReference: 'missing-semicolon-after-character-reference',
        unexpectedCharacterAfterDoctypeSystemIdentifier: 'unexpected-character-after-doctype-system-identifier',
        unexpectedCharacterInUnquotedAttributeValue: 'unexpected-character-in-unquoted-attribute-value',
        eofBeforeTagName: 'eof-before-tag-name',
        eofInTag: 'eof-in-tag',
        missingAttributeValue: 'missing-attribute-value',
        missingWhitespaceBetweenAttributes: 'missing-whitespace-between-attributes',
        missingWhitespaceAfterDoctypePublicKeyword: 'missing-whitespace-after-doctype-public-keyword',
        missingWhitespaceBetweenDoctypePublicAndSystemIdentifiers:
            'missing-whitespace-between-doctype-public-and-system-identifiers',
        missingWhitespaceAfterDoctypeSystemKeyword: 'missing-whitespace-after-doctype-system-keyword',
        missingQuoteBeforeDoctypePublicIdentifier: 'missing-quote-before-doctype-public-identifier',
        missingQuoteBeforeDoctypeSystemIdentifier: 'missing-quote-before-doctype-system-identifier',
        missingDoctypePublicIdentifier: 'missing-doctype-public-identifier',
        missingDoctypeSystemIdentifier: 'missing-doctype-system-identifier',
        abruptDoctypePublicIdentifier: 'abrupt-doctype-public-identifier',
        abruptDoctypeSystemIdentifier: 'abrupt-doctype-system-identifier',
        cdataInHtmlContent: 'cdata-in-html-content',
        incorrectlyOpenedComment: 'incorrectly-opened-comment',
        eofInScriptHtmlCommentLikeText: 'eof-in-script-html-comment-like-text',
        eofInDoctype: 'eof-in-doctype',
        nestedComment: 'nested-comment',
        abruptClosingOfEmptyComment: 'abrupt-closing-of-empty-comment',
        eofInComment: 'eof-in-comment',
        incorrectlyClosedComment: 'incorrectly-closed-comment',
        eofInCdata: 'eof-in-cdata',
        absenceOfDigitsInNumericCharacterReference: 'absence-of-digits-in-numeric-character-reference',
        nullCharacterReference: 'null-character-reference',
        surrogateCharacterReference: 'surrogate-character-reference',
        characterReferenceOutsideUnicodeRange: 'character-reference-outside-unicode-range',
        controlCharacterReference: 'control-character-reference',
        noncharacterCharacterReference: 'noncharacter-character-reference',
        missingWhitespaceBeforeDoctypeName: 'missing-whitespace-before-doctype-name',
        missingDoctypeName: 'missing-doctype-name',
        invalidCharacterSequenceAfterDoctypeName: 'invalid-character-sequence-after-doctype-name',
        duplicateAttribute: 'duplicate-attribute',
        nonConformingDoctype: 'non-conforming-doctype',
        missingDoctype: 'missing-doctype',
        misplacedDoctype: 'misplaced-doctype',
        endTagWithoutMatchingOpenElement: 'end-tag-without-matching-open-element',
        closingOfElementWithOpenChildElements: 'closing-of-element-with-open-child-elements',
        disallowedContentInNoscriptInHead: 'disallowed-content-in-noscript-in-head',
        openElementsLeftAfterEof: 'open-elements-left-after-eof',
        abandonedHeadElementChild: 'abandoned-head-element-child',
        misplacedStartTagForHeadElement: 'misplaced-start-tag-for-head-element',
        nestedNoscriptInHead: 'nested-noscript-in-head',
        eofInElementThatCanContainOnlyText: 'eof-in-element-that-can-contain-only-text'
    };

    //Aliases
    const $ = unicode.CODE_POINTS;

    //Const
    const DEFAULT_BUFFER_WATERLINE = 1 << 16;

    //Preprocessor
    //NOTE: HTML input preprocessing
    //(see: http://www.whatwg.org/specs/web-apps/current-work/multipage/parsing.html#preprocessing-the-input-stream)
    class Preprocessor {
        constructor() {
            this.html = null;

            this.pos = -1;
            this.lastGapPos = -1;
            this.lastCharPos = -1;

            this.gapStack = [];

            this.skipNextNewLine = false;

            this.lastChunkWritten = false;
            this.endOfChunkHit = false;
            this.bufferWaterline = DEFAULT_BUFFER_WATERLINE;
        }

        _err() {
            // NOTE: err reporting is noop by default. Enabled by mixin.
        }

        _addGap() {
            this.gapStack.push(this.lastGapPos);
            this.lastGapPos = this.pos;
        }

        _processSurrogate(cp) {
            //NOTE: try to peek a surrogate pair
            if (this.pos !== this.lastCharPos) {
                const nextCp = this.html.charCodeAt(this.pos + 1);

                if (unicode.isSurrogatePair(nextCp)) {
                    //NOTE: we have a surrogate pair. Peek pair character and recalculate code point.
                    this.pos++;

                    //NOTE: add gap that should be avoided during retreat
                    this._addGap();

                    return unicode.getSurrogatePairCodePoint(cp, nextCp);
                }
            }

            //NOTE: we are at the end of a chunk, therefore we can't infer surrogate pair yet.
            else if (!this.lastChunkWritten) {
                this.endOfChunkHit = true;
                return $.EOF;
            }

            //NOTE: isolated surrogate
            this._err(errorCodes.surrogateInInputStream);

            return cp;
        }

        dropParsedChunk() {
            if (this.pos > this.bufferWaterline) {
                this.lastCharPos -= this.pos;
                this.html = this.html.substring(this.pos);
                this.pos = 0;
                this.lastGapPos = -1;
                this.gapStack = [];
            }
        }

        write(chunk, isLastChunk) {
            if (this.html) {
                this.html += chunk;
            } else {
                this.html = chunk;
            }

            this.lastCharPos = this.html.length - 1;
            this.endOfChunkHit = false;
            this.lastChunkWritten = isLastChunk;
        }

        insertHtmlAtCurrentPos(chunk) {
            this.html = this.html.substring(0, this.pos + 1) + chunk + this.html.substring(this.pos + 1, this.html.length);

            this.lastCharPos = this.html.length - 1;
            this.endOfChunkHit = false;
        }

        advance() {
            this.pos++;

            if (this.pos > this.lastCharPos) {
                this.endOfChunkHit = !this.lastChunkWritten;
                return $.EOF;
            }

            let cp = this.html.charCodeAt(this.pos);

            //NOTE: any U+000A LINE FEED (LF) characters that immediately follow a U+000D CARRIAGE RETURN (CR) character
            //must be ignored.
            if (this.skipNextNewLine && cp === $.LINE_FEED) {
                this.skipNextNewLine = false;
                this._addGap();
                return this.advance();
            }

            //NOTE: all U+000D CARRIAGE RETURN (CR) characters must be converted to U+000A LINE FEED (LF) characters
            if (cp === $.CARRIAGE_RETURN) {
                this.skipNextNewLine = true;
                return $.LINE_FEED;
            }

            this.skipNextNewLine = false;

            if (unicode.isSurrogate(cp)) {
                cp = this._processSurrogate(cp);
            }

            //OPTIMIZATION: first check if code point is in the common allowed
            //range (ASCII alphanumeric, whitespaces, big chunk of BMP)
            //before going into detailed performance cost validation.
            const isCommonValidRange =
                (cp > 0x1f && cp < 0x7f) || cp === $.LINE_FEED || cp === $.CARRIAGE_RETURN || (cp > 0x9f && cp < 0xfdd0);

            if (!isCommonValidRange) {
                this._checkForProblematicCharacters(cp);
            }

            return cp;
        }

        _checkForProblematicCharacters(cp) {
            if (unicode.isControlCodePoint(cp)) {
                this._err(errorCodes.controlCharacterInInputStream);
            } else if (unicode.isUndefinedCodePoint(cp)) {
                this._err(errorCodes.noncharacterInInputStream);
            }
        }

        retreat() {
            if (this.pos === this.lastGapPos) {
                this.lastGapPos = this.gapStack.pop();
                this.pos--;
            }

            this.pos--;
        }
    }

    var preprocessor = Preprocessor;

    //NOTE: this file contains auto-generated array mapped radix tree that is used for the named entity references consumption
    //(details: https://github.com/inikulin/parse5/tree/master/scripts/generate-named-entity-data/README.md)
    var namedEntityData = new Uint16Array([4,52,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,106,303,412,810,1432,1701,1796,1987,2114,2360,2420,2484,3170,3251,4140,4393,4575,4610,5106,5512,5728,6117,6274,6315,6345,6427,6516,7002,7910,8733,9323,9870,10170,10631,10893,11318,11386,11467,12773,13092,14474,14922,15448,15542,16419,17666,18166,18611,19004,19095,19298,19397,4,16,69,77,97,98,99,102,103,108,109,110,111,112,114,115,116,117,140,150,158,169,176,194,199,210,216,222,226,242,256,266,283,294,108,105,103,5,198,1,59,148,1,198,80,5,38,1,59,156,1,38,99,117,116,101,5,193,1,59,167,1,193,114,101,118,101,59,1,258,4,2,105,121,182,191,114,99,5,194,1,59,189,1,194,59,1,1040,114,59,3,55349,56580,114,97,118,101,5,192,1,59,208,1,192,112,104,97,59,1,913,97,99,114,59,1,256,100,59,1,10835,4,2,103,112,232,237,111,110,59,1,260,102,59,3,55349,56632,112,108,121,70,117,110,99,116,105,111,110,59,1,8289,105,110,103,5,197,1,59,264,1,197,4,2,99,115,272,277,114,59,3,55349,56476,105,103,110,59,1,8788,105,108,100,101,5,195,1,59,292,1,195,109,108,5,196,1,59,301,1,196,4,8,97,99,101,102,111,114,115,117,321,350,354,383,388,394,400,405,4,2,99,114,327,336,107,115,108,97,115,104,59,1,8726,4,2,118,119,342,345,59,1,10983,101,100,59,1,8966,121,59,1,1041,4,3,99,114,116,362,369,379,97,117,115,101,59,1,8757,110,111,117,108,108,105,115,59,1,8492,97,59,1,914,114,59,3,55349,56581,112,102,59,3,55349,56633,101,118,101,59,1,728,99,114,59,1,8492,109,112,101,113,59,1,8782,4,14,72,79,97,99,100,101,102,104,105,108,111,114,115,117,442,447,456,504,542,547,569,573,577,616,678,784,790,796,99,121,59,1,1063,80,89,5,169,1,59,454,1,169,4,3,99,112,121,464,470,497,117,116,101,59,1,262,4,2,59,105,476,478,1,8914,116,97,108,68,105,102,102,101,114,101,110,116,105,97,108,68,59,1,8517,108,101,121,115,59,1,8493,4,4,97,101,105,111,514,520,530,535,114,111,110,59,1,268,100,105,108,5,199,1,59,528,1,199,114,99,59,1,264,110,105,110,116,59,1,8752,111,116,59,1,266,4,2,100,110,553,560,105,108,108,97,59,1,184,116,101,114,68,111,116,59,1,183,114,59,1,8493,105,59,1,935,114,99,108,101,4,4,68,77,80,84,591,596,603,609,111,116,59,1,8857,105,110,117,115,59,1,8854,108,117,115,59,1,8853,105,109,101,115,59,1,8855,111,4,2,99,115,623,646,107,119,105,115,101,67,111,110,116,111,117,114,73,110,116,101,103,114,97,108,59,1,8754,101,67,117,114,108,121,4,2,68,81,658,671,111,117,98,108,101,81,117,111,116,101,59,1,8221,117,111,116,101,59,1,8217,4,4,108,110,112,117,688,701,736,753,111,110,4,2,59,101,696,698,1,8759,59,1,10868,4,3,103,105,116,709,717,722,114,117,101,110,116,59,1,8801,110,116,59,1,8751,111,117,114,73,110,116,101,103,114,97,108,59,1,8750,4,2,102,114,742,745,59,1,8450,111,100,117,99,116,59,1,8720,110,116,101,114,67,108,111,99,107,119,105,115,101,67,111,110,116,111,117,114,73,110,116,101,103,114,97,108,59,1,8755,111,115,115,59,1,10799,99,114,59,3,55349,56478,112,4,2,59,67,803,805,1,8915,97,112,59,1,8781,4,11,68,74,83,90,97,99,101,102,105,111,115,834,850,855,860,865,888,903,916,921,1011,1415,4,2,59,111,840,842,1,8517,116,114,97,104,100,59,1,10513,99,121,59,1,1026,99,121,59,1,1029,99,121,59,1,1039,4,3,103,114,115,873,879,883,103,101,114,59,1,8225,114,59,1,8609,104,118,59,1,10980,4,2,97,121,894,900,114,111,110,59,1,270,59,1,1044,108,4,2,59,116,910,912,1,8711,97,59,1,916,114,59,3,55349,56583,4,2,97,102,927,998,4,2,99,109,933,992,114,105,116,105,99,97,108,4,4,65,68,71,84,950,957,978,985,99,117,116,101,59,1,180,111,4,2,116,117,964,967,59,1,729,98,108,101,65,99,117,116,101,59,1,733,114,97,118,101,59,1,96,105,108,100,101,59,1,732,111,110,100,59,1,8900,102,101,114,101,110,116,105,97,108,68,59,1,8518,4,4,112,116,117,119,1021,1026,1048,1249,102,59,3,55349,56635,4,3,59,68,69,1034,1036,1041,1,168,111,116,59,1,8412,113,117,97,108,59,1,8784,98,108,101,4,6,67,68,76,82,85,86,1065,1082,1101,1189,1211,1236,111,110,116,111,117,114,73,110,116,101,103,114,97,108,59,1,8751,111,4,2,116,119,1089,1092,59,1,168,110,65,114,114,111,119,59,1,8659,4,2,101,111,1107,1141,102,116,4,3,65,82,84,1117,1124,1136,114,114,111,119,59,1,8656,105,103,104,116,65,114,114,111,119,59,1,8660,101,101,59,1,10980,110,103,4,2,76,82,1149,1177,101,102,116,4,2,65,82,1158,1165,114,114,111,119,59,1,10232,105,103,104,116,65,114,114,111,119,59,1,10234,105,103,104,116,65,114,114,111,119,59,1,10233,105,103,104,116,4,2,65,84,1199,1206,114,114,111,119,59,1,8658,101,101,59,1,8872,112,4,2,65,68,1218,1225,114,114,111,119,59,1,8657,111,119,110,65,114,114,111,119,59,1,8661,101,114,116,105,99,97,108,66,97,114,59,1,8741,110,4,6,65,66,76,82,84,97,1264,1292,1299,1352,1391,1408,114,114,111,119,4,3,59,66,85,1276,1278,1283,1,8595,97,114,59,1,10515,112,65,114,114,111,119,59,1,8693,114,101,118,101,59,1,785,101,102,116,4,3,82,84,86,1310,1323,1334,105,103,104,116,86,101,99,116,111,114,59,1,10576,101,101,86,101,99,116,111,114,59,1,10590,101,99,116,111,114,4,2,59,66,1345,1347,1,8637,97,114,59,1,10582,105,103,104,116,4,2,84,86,1362,1373,101,101,86,101,99,116,111,114,59,1,10591,101,99,116,111,114,4,2,59,66,1384,1386,1,8641,97,114,59,1,10583,101,101,4,2,59,65,1399,1401,1,8868,114,114,111,119,59,1,8615,114,114,111,119,59,1,8659,4,2,99,116,1421,1426,114,59,3,55349,56479,114,111,107,59,1,272,4,16,78,84,97,99,100,102,103,108,109,111,112,113,115,116,117,120,1466,1470,1478,1489,1515,1520,1525,1536,1544,1593,1609,1617,1650,1664,1668,1677,71,59,1,330,72,5,208,1,59,1476,1,208,99,117,116,101,5,201,1,59,1487,1,201,4,3,97,105,121,1497,1503,1512,114,111,110,59,1,282,114,99,5,202,1,59,1510,1,202,59,1,1069,111,116,59,1,278,114,59,3,55349,56584,114,97,118,101,5,200,1,59,1534,1,200,101,109,101,110,116,59,1,8712,4,2,97,112,1550,1555,99,114,59,1,274,116,121,4,2,83,86,1563,1576,109,97,108,108,83,113,117,97,114,101,59,1,9723,101,114,121,83,109,97,108,108,83,113,117,97,114,101,59,1,9643,4,2,103,112,1599,1604,111,110,59,1,280,102,59,3,55349,56636,115,105,108,111,110,59,1,917,117,4,2,97,105,1624,1640,108,4,2,59,84,1631,1633,1,10869,105,108,100,101,59,1,8770,108,105,98,114,105,117,109,59,1,8652,4,2,99,105,1656,1660,114,59,1,8496,109,59,1,10867,97,59,1,919,109,108,5,203,1,59,1675,1,203,4,2,105,112,1683,1689,115,116,115,59,1,8707,111,110,101,110,116,105,97,108,69,59,1,8519,4,5,99,102,105,111,115,1713,1717,1722,1762,1791,121,59,1,1060,114,59,3,55349,56585,108,108,101,100,4,2,83,86,1732,1745,109,97,108,108,83,113,117,97,114,101,59,1,9724,101,114,121,83,109,97,108,108,83,113,117,97,114,101,59,1,9642,4,3,112,114,117,1770,1775,1781,102,59,3,55349,56637,65,108,108,59,1,8704,114,105,101,114,116,114,102,59,1,8497,99,114,59,1,8497,4,12,74,84,97,98,99,100,102,103,111,114,115,116,1822,1827,1834,1848,1855,1877,1882,1887,1890,1896,1978,1984,99,121,59,1,1027,5,62,1,59,1832,1,62,109,109,97,4,2,59,100,1843,1845,1,915,59,1,988,114,101,118,101,59,1,286,4,3,101,105,121,1863,1869,1874,100,105,108,59,1,290,114,99,59,1,284,59,1,1043,111,116,59,1,288,114,59,3,55349,56586,59,1,8921,112,102,59,3,55349,56638,101,97,116,101,114,4,6,69,70,71,76,83,84,1915,1933,1944,1953,1959,1971,113,117,97,108,4,2,59,76,1925,1927,1,8805,101,115,115,59,1,8923,117,108,108,69,113,117,97,108,59,1,8807,114,101,97,116,101,114,59,1,10914,101,115,115,59,1,8823,108,97,110,116,69,113,117,97,108,59,1,10878,105,108,100,101,59,1,8819,99,114,59,3,55349,56482,59,1,8811,4,8,65,97,99,102,105,111,115,117,2005,2012,2026,2032,2036,2049,2073,2089,82,68,99,121,59,1,1066,4,2,99,116,2018,2023,101,107,59,1,711,59,1,94,105,114,99,59,1,292,114,59,1,8460,108,98,101,114,116,83,112,97,99,101,59,1,8459,4,2,112,114,2055,2059,102,59,1,8461,105,122,111,110,116,97,108,76,105,110,101,59,1,9472,4,2,99,116,2079,2083,114,59,1,8459,114,111,107,59,1,294,109,112,4,2,68,69,2097,2107,111,119,110,72,117,109,112,59,1,8782,113,117,97,108,59,1,8783,4,14,69,74,79,97,99,100,102,103,109,110,111,115,116,117,2144,2149,2155,2160,2171,2189,2194,2198,2209,2245,2307,2329,2334,2341,99,121,59,1,1045,108,105,103,59,1,306,99,121,59,1,1025,99,117,116,101,5,205,1,59,2169,1,205,4,2,105,121,2177,2186,114,99,5,206,1,59,2184,1,206,59,1,1048,111,116,59,1,304,114,59,1,8465,114,97,118,101,5,204,1,59,2207,1,204,4,3,59,97,112,2217,2219,2238,1,8465,4,2,99,103,2225,2229,114,59,1,298,105,110,97,114,121,73,59,1,8520,108,105,101,115,59,1,8658,4,2,116,118,2251,2281,4,2,59,101,2257,2259,1,8748,4,2,103,114,2265,2271,114,97,108,59,1,8747,115,101,99,116,105,111,110,59,1,8898,105,115,105,98,108,101,4,2,67,84,2293,2300,111,109,109,97,59,1,8291,105,109,101,115,59,1,8290,4,3,103,112,116,2315,2320,2325,111,110,59,1,302,102,59,3,55349,56640,97,59,1,921,99,114,59,1,8464,105,108,100,101,59,1,296,4,2,107,109,2347,2352,99,121,59,1,1030,108,5,207,1,59,2358,1,207,4,5,99,102,111,115,117,2372,2386,2391,2397,2414,4,2,105,121,2378,2383,114,99,59,1,308,59,1,1049,114,59,3,55349,56589,112,102,59,3,55349,56641,4,2,99,101,2403,2408,114,59,3,55349,56485,114,99,121,59,1,1032,107,99,121,59,1,1028,4,7,72,74,97,99,102,111,115,2436,2441,2446,2452,2467,2472,2478,99,121,59,1,1061,99,121,59,1,1036,112,112,97,59,1,922,4,2,101,121,2458,2464,100,105,108,59,1,310,59,1,1050,114,59,3,55349,56590,112,102,59,3,55349,56642,99,114,59,3,55349,56486,4,11,74,84,97,99,101,102,108,109,111,115,116,2508,2513,2520,2562,2585,2981,2986,3004,3011,3146,3167,99,121,59,1,1033,5,60,1,59,2518,1,60,4,5,99,109,110,112,114,2532,2538,2544,2548,2558,117,116,101,59,1,313,98,100,97,59,1,923,103,59,1,10218,108,97,99,101,116,114,102,59,1,8466,114,59,1,8606,4,3,97,101,121,2570,2576,2582,114,111,110,59,1,317,100,105,108,59,1,315,59,1,1051,4,2,102,115,2591,2907,116,4,10,65,67,68,70,82,84,85,86,97,114,2614,2663,2672,2728,2735,2760,2820,2870,2888,2895,4,2,110,114,2620,2633,103,108,101,66,114,97,99,107,101,116,59,1,10216,114,111,119,4,3,59,66,82,2644,2646,2651,1,8592,97,114,59,1,8676,105,103,104,116,65,114,114,111,119,59,1,8646,101,105,108,105,110,103,59,1,8968,111,4,2,117,119,2679,2692,98,108,101,66,114,97,99,107,101,116,59,1,10214,110,4,2,84,86,2699,2710,101,101,86,101,99,116,111,114,59,1,10593,101,99,116,111,114,4,2,59,66,2721,2723,1,8643,97,114,59,1,10585,108,111,111,114,59,1,8970,105,103,104,116,4,2,65,86,2745,2752,114,114,111,119,59,1,8596,101,99,116,111,114,59,1,10574,4,2,101,114,2766,2792,101,4,3,59,65,86,2775,2777,2784,1,8867,114,114,111,119,59,1,8612,101,99,116,111,114,59,1,10586,105,97,110,103,108,101,4,3,59,66,69,2806,2808,2813,1,8882,97,114,59,1,10703,113,117,97,108,59,1,8884,112,4,3,68,84,86,2829,2841,2852,111,119,110,86,101,99,116,111,114,59,1,10577,101,101,86,101,99,116,111,114,59,1,10592,101,99,116,111,114,4,2,59,66,2863,2865,1,8639,97,114,59,1,10584,101,99,116,111,114,4,2,59,66,2881,2883,1,8636,97,114,59,1,10578,114,114,111,119,59,1,8656,105,103,104,116,97,114,114,111,119,59,1,8660,115,4,6,69,70,71,76,83,84,2922,2936,2947,2956,2962,2974,113,117,97,108,71,114,101,97,116,101,114,59,1,8922,117,108,108,69,113,117,97,108,59,1,8806,114,101,97,116,101,114,59,1,8822,101,115,115,59,1,10913,108,97,110,116,69,113,117,97,108,59,1,10877,105,108,100,101,59,1,8818,114,59,3,55349,56591,4,2,59,101,2992,2994,1,8920,102,116,97,114,114,111,119,59,1,8666,105,100,111,116,59,1,319,4,3,110,112,119,3019,3110,3115,103,4,4,76,82,108,114,3030,3058,3070,3098,101,102,116,4,2,65,82,3039,3046,114,114,111,119,59,1,10229,105,103,104,116,65,114,114,111,119,59,1,10231,105,103,104,116,65,114,114,111,119,59,1,10230,101,102,116,4,2,97,114,3079,3086,114,114,111,119,59,1,10232,105,103,104,116,97,114,114,111,119,59,1,10234,105,103,104,116,97,114,114,111,119,59,1,10233,102,59,3,55349,56643,101,114,4,2,76,82,3123,3134,101,102,116,65,114,114,111,119,59,1,8601,105,103,104,116,65,114,114,111,119,59,1,8600,4,3,99,104,116,3154,3158,3161,114,59,1,8466,59,1,8624,114,111,107,59,1,321,59,1,8810,4,8,97,99,101,102,105,111,115,117,3188,3192,3196,3222,3227,3237,3243,3248,112,59,1,10501,121,59,1,1052,4,2,100,108,3202,3213,105,117,109,83,112,97,99,101,59,1,8287,108,105,110,116,114,102,59,1,8499,114,59,3,55349,56592,110,117,115,80,108,117,115,59,1,8723,112,102,59,3,55349,56644,99,114,59,1,8499,59,1,924,4,9,74,97,99,101,102,111,115,116,117,3271,3276,3283,3306,3422,3427,4120,4126,4137,99,121,59,1,1034,99,117,116,101,59,1,323,4,3,97,101,121,3291,3297,3303,114,111,110,59,1,327,100,105,108,59,1,325,59,1,1053,4,3,103,115,119,3314,3380,3415,97,116,105,118,101,4,3,77,84,86,3327,3340,3365,101,100,105,117,109,83,112,97,99,101,59,1,8203,104,105,4,2,99,110,3348,3357,107,83,112,97,99,101,59,1,8203,83,112,97,99,101,59,1,8203,101,114,121,84,104,105,110,83,112,97,99,101,59,1,8203,116,101,100,4,2,71,76,3389,3405,114,101,97,116,101,114,71,114,101,97,116,101,114,59,1,8811,101,115,115,76,101,115,115,59,1,8810,76,105,110,101,59,1,10,114,59,3,55349,56593,4,4,66,110,112,116,3437,3444,3460,3464,114,101,97,107,59,1,8288,66,114,101,97,107,105,110,103,83,112,97,99,101,59,1,160,102,59,1,8469,4,13,59,67,68,69,71,72,76,78,80,82,83,84,86,3492,3494,3517,3536,3578,3657,3685,3784,3823,3860,3915,4066,4107,1,10988,4,2,111,117,3500,3510,110,103,114,117,101,110,116,59,1,8802,112,67,97,112,59,1,8813,111,117,98,108,101,86,101,114,116,105,99,97,108,66,97,114,59,1,8742,4,3,108,113,120,3544,3552,3571,101,109,101,110,116,59,1,8713,117,97,108,4,2,59,84,3561,3563,1,8800,105,108,100,101,59,3,8770,824,105,115,116,115,59,1,8708,114,101,97,116,101,114,4,7,59,69,70,71,76,83,84,3600,3602,3609,3621,3631,3637,3650,1,8815,113,117,97,108,59,1,8817,117,108,108,69,113,117,97,108,59,3,8807,824,114,101,97,116,101,114,59,3,8811,824,101,115,115,59,1,8825,108,97,110,116,69,113,117,97,108,59,3,10878,824,105,108,100,101,59,1,8821,117,109,112,4,2,68,69,3666,3677,111,119,110,72,117,109,112,59,3,8782,824,113,117,97,108,59,3,8783,824,101,4,2,102,115,3692,3724,116,84,114,105,97,110,103,108,101,4,3,59,66,69,3709,3711,3717,1,8938,97,114,59,3,10703,824,113,117,97,108,59,1,8940,115,4,6,59,69,71,76,83,84,3739,3741,3748,3757,3764,3777,1,8814,113,117,97,108,59,1,8816,114,101,97,116,101,114,59,1,8824,101,115,115,59,3,8810,824,108,97,110,116,69,113,117,97,108,59,3,10877,824,105,108,100,101,59,1,8820,101,115,116,101,100,4,2,71,76,3795,3812,114,101,97,116,101,114,71,114,101,97,116,101,114,59,3,10914,824,101,115,115,76,101,115,115,59,3,10913,824,114,101,99,101,100,101,115,4,3,59,69,83,3838,3840,3848,1,8832,113,117,97,108,59,3,10927,824,108,97,110,116,69,113,117,97,108,59,1,8928,4,2,101,105,3866,3881,118,101,114,115,101,69,108,101,109,101,110,116,59,1,8716,103,104,116,84,114,105,97,110,103,108,101,4,3,59,66,69,3900,3902,3908,1,8939,97,114,59,3,10704,824,113,117,97,108,59,1,8941,4,2,113,117,3921,3973,117,97,114,101,83,117,4,2,98,112,3933,3952,115,101,116,4,2,59,69,3942,3945,3,8847,824,113,117,97,108,59,1,8930,101,114,115,101,116,4,2,59,69,3963,3966,3,8848,824,113,117,97,108,59,1,8931,4,3,98,99,112,3981,4000,4045,115,101,116,4,2,59,69,3990,3993,3,8834,8402,113,117,97,108,59,1,8840,99,101,101,100,115,4,4,59,69,83,84,4015,4017,4025,4037,1,8833,113,117,97,108,59,3,10928,824,108,97,110,116,69,113,117,97,108,59,1,8929,105,108,100,101,59,3,8831,824,101,114,115,101,116,4,2,59,69,4056,4059,3,8835,8402,113,117,97,108,59,1,8841,105,108,100,101,4,4,59,69,70,84,4080,4082,4089,4100,1,8769,113,117,97,108,59,1,8772,117,108,108,69,113,117,97,108,59,1,8775,105,108,100,101,59,1,8777,101,114,116,105,99,97,108,66,97,114,59,1,8740,99,114,59,3,55349,56489,105,108,100,101,5,209,1,59,4135,1,209,59,1,925,4,14,69,97,99,100,102,103,109,111,112,114,115,116,117,118,4170,4176,4187,4205,4212,4217,4228,4253,4259,4292,4295,4316,4337,4346,108,105,103,59,1,338,99,117,116,101,5,211,1,59,4185,1,211,4,2,105,121,4193,4202,114,99,5,212,1,59,4200,1,212,59,1,1054,98,108,97,99,59,1,336,114,59,3,55349,56594,114,97,118,101,5,210,1,59,4226,1,210,4,3,97,101,105,4236,4241,4246,99,114,59,1,332,103,97,59,1,937,99,114,111,110,59,1,927,112,102,59,3,55349,56646,101,110,67,117,114,108,121,4,2,68,81,4272,4285,111,117,98,108,101,81,117,111,116,101,59,1,8220,117,111,116,101,59,1,8216,59,1,10836,4,2,99,108,4301,4306,114,59,3,55349,56490,97,115,104,5,216,1,59,4314,1,216,105,4,2,108,109,4323,4332,100,101,5,213,1,59,4330,1,213,101,115,59,1,10807,109,108,5,214,1,59,4344,1,214,101,114,4,2,66,80,4354,4380,4,2,97,114,4360,4364,114,59,1,8254,97,99,4,2,101,107,4372,4375,59,1,9182,101,116,59,1,9140,97,114,101,110,116,104,101,115,105,115,59,1,9180,4,9,97,99,102,104,105,108,111,114,115,4413,4422,4426,4431,4435,4438,4448,4471,4561,114,116,105,97,108,68,59,1,8706,121,59,1,1055,114,59,3,55349,56595,105,59,1,934,59,1,928,117,115,77,105,110,117,115,59,1,177,4,2,105,112,4454,4467,110,99,97,114,101,112,108,97,110,101,59,1,8460,102,59,1,8473,4,4,59,101,105,111,4481,4483,4526,4531,1,10939,99,101,100,101,115,4,4,59,69,83,84,4498,4500,4507,4519,1,8826,113,117,97,108,59,1,10927,108,97,110,116,69,113,117,97,108,59,1,8828,105,108,100,101,59,1,8830,109,101,59,1,8243,4,2,100,112,4537,4543,117,99,116,59,1,8719,111,114,116,105,111,110,4,2,59,97,4555,4557,1,8759,108,59,1,8733,4,2,99,105,4567,4572,114,59,3,55349,56491,59,1,936,4,4,85,102,111,115,4585,4594,4599,4604,79,84,5,34,1,59,4592,1,34,114,59,3,55349,56596,112,102,59,1,8474,99,114,59,3,55349,56492,4,12,66,69,97,99,101,102,104,105,111,114,115,117,4636,4642,4650,4681,4704,4763,4767,4771,5047,5069,5081,5094,97,114,114,59,1,10512,71,5,174,1,59,4648,1,174,4,3,99,110,114,4658,4664,4668,117,116,101,59,1,340,103,59,1,10219,114,4,2,59,116,4675,4677,1,8608,108,59,1,10518,4,3,97,101,121,4689,4695,4701,114,111,110,59,1,344,100,105,108,59,1,342,59,1,1056,4,2,59,118,4710,4712,1,8476,101,114,115,101,4,2,69,85,4722,4748,4,2,108,113,4728,4736,101,109,101,110,116,59,1,8715,117,105,108,105,98,114,105,117,109,59,1,8651,112,69,113,117,105,108,105,98,114,105,117,109,59,1,10607,114,59,1,8476,111,59,1,929,103,104,116,4,8,65,67,68,70,84,85,86,97,4792,4840,4849,4905,4912,4972,5022,5040,4,2,110,114,4798,4811,103,108,101,66,114,97,99,107,101,116,59,1,10217,114,111,119,4,3,59,66,76,4822,4824,4829,1,8594,97,114,59,1,8677,101,102,116,65,114,114,111,119,59,1,8644,101,105,108,105,110,103,59,1,8969,111,4,2,117,119,4856,4869,98,108,101,66,114,97,99,107,101,116,59,1,10215,110,4,2,84,86,4876,4887,101,101,86,101,99,116,111,114,59,1,10589,101,99,116,111,114,4,2,59,66,4898,4900,1,8642,97,114,59,1,10581,108,111,111,114,59,1,8971,4,2,101,114,4918,4944,101,4,3,59,65,86,4927,4929,4936,1,8866,114,114,111,119,59,1,8614,101,99,116,111,114,59,1,10587,105,97,110,103,108,101,4,3,59,66,69,4958,4960,4965,1,8883,97,114,59,1,10704,113,117,97,108,59,1,8885,112,4,3,68,84,86,4981,4993,5004,111,119,110,86,101,99,116,111,114,59,1,10575,101,101,86,101,99,116,111,114,59,1,10588,101,99,116,111,114,4,2,59,66,5015,5017,1,8638,97,114,59,1,10580,101,99,116,111,114,4,2,59,66,5033,5035,1,8640,97,114,59,1,10579,114,114,111,119,59,1,8658,4,2,112,117,5053,5057,102,59,1,8477,110,100,73,109,112,108,105,101,115,59,1,10608,105,103,104,116,97,114,114,111,119,59,1,8667,4,2,99,104,5087,5091,114,59,1,8475,59,1,8625,108,101,68,101,108,97,121,101,100,59,1,10740,4,13,72,79,97,99,102,104,105,109,111,113,115,116,117,5134,5150,5157,5164,5198,5203,5259,5265,5277,5283,5374,5380,5385,4,2,67,99,5140,5146,72,99,121,59,1,1065,121,59,1,1064,70,84,99,121,59,1,1068,99,117,116,101,59,1,346,4,5,59,97,101,105,121,5176,5178,5184,5190,5195,1,10940,114,111,110,59,1,352,100,105,108,59,1,350,114,99,59,1,348,59,1,1057,114,59,3,55349,56598,111,114,116,4,4,68,76,82,85,5216,5227,5238,5250,111,119,110,65,114,114,111,119,59,1,8595,101,102,116,65,114,114,111,119,59,1,8592,105,103,104,116,65,114,114,111,119,59,1,8594,112,65,114,114,111,119,59,1,8593,103,109,97,59,1,931,97,108,108,67,105,114,99,108,101,59,1,8728,112,102,59,3,55349,56650,4,2,114,117,5289,5293,116,59,1,8730,97,114,101,4,4,59,73,83,85,5306,5308,5322,5367,1,9633,110,116,101,114,115,101,99,116,105,111,110,59,1,8851,117,4,2,98,112,5329,5347,115,101,116,4,2,59,69,5338,5340,1,8847,113,117,97,108,59,1,8849,101,114,115,101,116,4,2,59,69,5358,5360,1,8848,113,117,97,108,59,1,8850,110,105,111,110,59,1,8852,99,114,59,3,55349,56494,97,114,59,1,8902,4,4,98,99,109,112,5395,5420,5475,5478,4,2,59,115,5401,5403,1,8912,101,116,4,2,59,69,5411,5413,1,8912,113,117,97,108,59,1,8838,4,2,99,104,5426,5468,101,101,100,115,4,4,59,69,83,84,5440,5442,5449,5461,1,8827,113,117,97,108,59,1,10928,108,97,110,116,69,113,117,97,108,59,1,8829,105,108,100,101,59,1,8831,84,104,97,116,59,1,8715,59,1,8721,4,3,59,101,115,5486,5488,5507,1,8913,114,115,101,116,4,2,59,69,5498,5500,1,8835,113,117,97,108,59,1,8839,101,116,59,1,8913,4,11,72,82,83,97,99,102,104,105,111,114,115,5536,5546,5552,5567,5579,5602,5607,5655,5695,5701,5711,79,82,78,5,222,1,59,5544,1,222,65,68,69,59,1,8482,4,2,72,99,5558,5563,99,121,59,1,1035,121,59,1,1062,4,2,98,117,5573,5576,59,1,9,59,1,932,4,3,97,101,121,5587,5593,5599,114,111,110,59,1,356,100,105,108,59,1,354,59,1,1058,114,59,3,55349,56599,4,2,101,105,5613,5631,4,2,114,116,5619,5627,101,102,111,114,101,59,1,8756,97,59,1,920,4,2,99,110,5637,5647,107,83,112,97,99,101,59,3,8287,8202,83,112,97,99,101,59,1,8201,108,100,101,4,4,59,69,70,84,5668,5670,5677,5688,1,8764,113,117,97,108,59,1,8771,117,108,108,69,113,117,97,108,59,1,8773,105,108,100,101,59,1,8776,112,102,59,3,55349,56651,105,112,108,101,68,111,116,59,1,8411,4,2,99,116,5717,5722,114,59,3,55349,56495,114,111,107,59,1,358,4,14,97,98,99,100,102,103,109,110,111,112,114,115,116,117,5758,5789,5805,5823,5830,5835,5846,5852,5921,5937,6089,6095,6101,6108,4,2,99,114,5764,5774,117,116,101,5,218,1,59,5772,1,218,114,4,2,59,111,5781,5783,1,8607,99,105,114,59,1,10569,114,4,2,99,101,5796,5800,121,59,1,1038,118,101,59,1,364,4,2,105,121,5811,5820,114,99,5,219,1,59,5818,1,219,59,1,1059,98,108,97,99,59,1,368,114,59,3,55349,56600,114,97,118,101,5,217,1,59,5844,1,217,97,99,114,59,1,362,4,2,100,105,5858,5905,101,114,4,2,66,80,5866,5892,4,2,97,114,5872,5876,114,59,1,95,97,99,4,2,101,107,5884,5887,59,1,9183,101,116,59,1,9141,97,114,101,110,116,104,101,115,105,115,59,1,9181,111,110,4,2,59,80,5913,5915,1,8899,108,117,115,59,1,8846,4,2,103,112,5927,5932,111,110,59,1,370,102,59,3,55349,56652,4,8,65,68,69,84,97,100,112,115,5955,5985,5996,6009,6026,6033,6044,6075,114,114,111,119,4,3,59,66,68,5967,5969,5974,1,8593,97,114,59,1,10514,111,119,110,65,114,114,111,119,59,1,8645,111,119,110,65,114,114,111,119,59,1,8597,113,117,105,108,105,98,114,105,117,109,59,1,10606,101,101,4,2,59,65,6017,6019,1,8869,114,114,111,119,59,1,8613,114,114,111,119,59,1,8657,111,119,110,97,114,114,111,119,59,1,8661,101,114,4,2,76,82,6052,6063,101,102,116,65,114,114,111,119,59,1,8598,105,103,104,116,65,114,114,111,119,59,1,8599,105,4,2,59,108,6082,6084,1,978,111,110,59,1,933,105,110,103,59,1,366,99,114,59,3,55349,56496,105,108,100,101,59,1,360,109,108,5,220,1,59,6115,1,220,4,9,68,98,99,100,101,102,111,115,118,6137,6143,6148,6152,6166,6250,6255,6261,6267,97,115,104,59,1,8875,97,114,59,1,10987,121,59,1,1042,97,115,104,4,2,59,108,6161,6163,1,8873,59,1,10982,4,2,101,114,6172,6175,59,1,8897,4,3,98,116,121,6183,6188,6238,97,114,59,1,8214,4,2,59,105,6194,6196,1,8214,99,97,108,4,4,66,76,83,84,6209,6214,6220,6231,97,114,59,1,8739,105,110,101,59,1,124,101,112,97,114,97,116,111,114,59,1,10072,105,108,100,101,59,1,8768,84,104,105,110,83,112,97,99,101,59,1,8202,114,59,3,55349,56601,112,102,59,3,55349,56653,99,114,59,3,55349,56497,100,97,115,104,59,1,8874,4,5,99,101,102,111,115,6286,6292,6298,6303,6309,105,114,99,59,1,372,100,103,101,59,1,8896,114,59,3,55349,56602,112,102,59,3,55349,56654,99,114,59,3,55349,56498,4,4,102,105,111,115,6325,6330,6333,6339,114,59,3,55349,56603,59,1,926,112,102,59,3,55349,56655,99,114,59,3,55349,56499,4,9,65,73,85,97,99,102,111,115,117,6365,6370,6375,6380,6391,6405,6410,6416,6422,99,121,59,1,1071,99,121,59,1,1031,99,121,59,1,1070,99,117,116,101,5,221,1,59,6389,1,221,4,2,105,121,6397,6402,114,99,59,1,374,59,1,1067,114,59,3,55349,56604,112,102,59,3,55349,56656,99,114,59,3,55349,56500,109,108,59,1,376,4,8,72,97,99,100,101,102,111,115,6445,6450,6457,6472,6477,6501,6505,6510,99,121,59,1,1046,99,117,116,101,59,1,377,4,2,97,121,6463,6469,114,111,110,59,1,381,59,1,1047,111,116,59,1,379,4,2,114,116,6483,6497,111,87,105,100,116,104,83,112,97,99,101,59,1,8203,97,59,1,918,114,59,1,8488,112,102,59,1,8484,99,114,59,3,55349,56501,4,16,97,98,99,101,102,103,108,109,110,111,112,114,115,116,117,119,6550,6561,6568,6612,6622,6634,6645,6672,6699,6854,6870,6923,6933,6963,6974,6983,99,117,116,101,5,225,1,59,6559,1,225,114,101,118,101,59,1,259,4,6,59,69,100,105,117,121,6582,6584,6588,6591,6600,6609,1,8766,59,3,8766,819,59,1,8767,114,99,5,226,1,59,6598,1,226,116,101,5,180,1,59,6607,1,180,59,1,1072,108,105,103,5,230,1,59,6620,1,230,4,2,59,114,6628,6630,1,8289,59,3,55349,56606,114,97,118,101,5,224,1,59,6643,1,224,4,2,101,112,6651,6667,4,2,102,112,6657,6663,115,121,109,59,1,8501,104,59,1,8501,104,97,59,1,945,4,2,97,112,6678,6692,4,2,99,108,6684,6688,114,59,1,257,103,59,1,10815,5,38,1,59,6697,1,38,4,2,100,103,6705,6737,4,5,59,97,100,115,118,6717,6719,6724,6727,6734,1,8743,110,100,59,1,10837,59,1,10844,108,111,112,101,59,1,10840,59,1,10842,4,7,59,101,108,109,114,115,122,6753,6755,6758,6762,6814,6835,6848,1,8736,59,1,10660,101,59,1,8736,115,100,4,2,59,97,6770,6772,1,8737,4,8,97,98,99,100,101,102,103,104,6790,6793,6796,6799,6802,6805,6808,6811,59,1,10664,59,1,10665,59,1,10666,59,1,10667,59,1,10668,59,1,10669,59,1,10670,59,1,10671,116,4,2,59,118,6821,6823,1,8735,98,4,2,59,100,6830,6832,1,8894,59,1,10653,4,2,112,116,6841,6845,104,59,1,8738,59,1,197,97,114,114,59,1,9084,4,2,103,112,6860,6865,111,110,59,1,261,102,59,3,55349,56658,4,7,59,69,97,101,105,111,112,6886,6888,6891,6897,6900,6904,6908,1,8776,59,1,10864,99,105,114,59,1,10863,59,1,8778,100,59,1,8779,115,59,1,39,114,111,120,4,2,59,101,6917,6919,1,8776,113,59,1,8778,105,110,103,5,229,1,59,6931,1,229,4,3,99,116,121,6941,6946,6949,114,59,3,55349,56502,59,1,42,109,112,4,2,59,101,6957,6959,1,8776,113,59,1,8781,105,108,100,101,5,227,1,59,6972,1,227,109,108,5,228,1,59,6981,1,228,4,2,99,105,6989,6997,111,110,105,110,116,59,1,8755,110,116,59,1,10769,4,16,78,97,98,99,100,101,102,105,107,108,110,111,112,114,115,117,7036,7041,7119,7135,7149,7155,7219,7224,7347,7354,7463,7489,7786,7793,7814,7866,111,116,59,1,10989,4,2,99,114,7047,7094,107,4,4,99,101,112,115,7058,7064,7073,7080,111,110,103,59,1,8780,112,115,105,108,111,110,59,1,1014,114,105,109,101,59,1,8245,105,109,4,2,59,101,7088,7090,1,8765,113,59,1,8909,4,2,118,119,7100,7105,101,101,59,1,8893,101,100,4,2,59,103,7113,7115,1,8965,101,59,1,8965,114,107,4,2,59,116,7127,7129,1,9141,98,114,107,59,1,9142,4,2,111,121,7141,7146,110,103,59,1,8780,59,1,1073,113,117,111,59,1,8222,4,5,99,109,112,114,116,7167,7181,7188,7193,7199,97,117,115,4,2,59,101,7176,7178,1,8757,59,1,8757,112,116,121,118,59,1,10672,115,105,59,1,1014,110,111,117,59,1,8492,4,3,97,104,119,7207,7210,7213,59,1,946,59,1,8502,101,101,110,59,1,8812,114,59,3,55349,56607,103,4,7,99,111,115,116,117,118,119,7241,7262,7288,7305,7328,7335,7340,4,3,97,105,117,7249,7253,7258,112,59,1,8898,114,99,59,1,9711,112,59,1,8899,4,3,100,112,116,7270,7275,7281,111,116,59,1,10752,108,117,115,59,1,10753,105,109,101,115,59,1,10754,4,2,113,116,7294,7300,99,117,112,59,1,10758,97,114,59,1,9733,114,105,97,110,103,108,101,4,2,100,117,7318,7324,111,119,110,59,1,9661,112,59,1,9651,112,108,117,115,59,1,10756,101,101,59,1,8897,101,100,103,101,59,1,8896,97,114,111,119,59,1,10509,4,3,97,107,111,7362,7436,7458,4,2,99,110,7368,7432,107,4,3,108,115,116,7377,7386,7394,111,122,101,110,103,101,59,1,10731,113,117,97,114,101,59,1,9642,114,105,97,110,103,108,101,4,4,59,100,108,114,7411,7413,7419,7425,1,9652,111,119,110,59,1,9662,101,102,116,59,1,9666,105,103,104,116,59,1,9656,107,59,1,9251,4,2,49,51,7442,7454,4,2,50,52,7448,7451,59,1,9618,59,1,9617,52,59,1,9619,99,107,59,1,9608,4,2,101,111,7469,7485,4,2,59,113,7475,7478,3,61,8421,117,105,118,59,3,8801,8421,116,59,1,8976,4,4,112,116,119,120,7499,7504,7517,7523,102,59,3,55349,56659,4,2,59,116,7510,7512,1,8869,111,109,59,1,8869,116,105,101,59,1,8904,4,12,68,72,85,86,98,100,104,109,112,116,117,118,7549,7571,7597,7619,7655,7660,7682,7708,7715,7721,7728,7750,4,4,76,82,108,114,7559,7562,7565,7568,59,1,9559,59,1,9556,59,1,9558,59,1,9555,4,5,59,68,85,100,117,7583,7585,7588,7591,7594,1,9552,59,1,9574,59,1,9577,59,1,9572,59,1,9575,4,4,76,82,108,114,7607,7610,7613,7616,59,1,9565,59,1,9562,59,1,9564,59,1,9561,4,7,59,72,76,82,104,108,114,7635,7637,7640,7643,7646,7649,7652,1,9553,59,1,9580,59,1,9571,59,1,9568,59,1,9579,59,1,9570,59,1,9567,111,120,59,1,10697,4,4,76,82,108,114,7670,7673,7676,7679,59,1,9557,59,1,9554,59,1,9488,59,1,9484,4,5,59,68,85,100,117,7694,7696,7699,7702,7705,1,9472,59,1,9573,59,1,9576,59,1,9516,59,1,9524,105,110,117,115,59,1,8863,108,117,115,59,1,8862,105,109,101,115,59,1,8864,4,4,76,82,108,114,7738,7741,7744,7747,59,1,9563,59,1,9560,59,1,9496,59,1,9492,4,7,59,72,76,82,104,108,114,7766,7768,7771,7774,7777,7780,7783,1,9474,59,1,9578,59,1,9569,59,1,9566,59,1,9532,59,1,9508,59,1,9500,114,105,109,101,59,1,8245,4,2,101,118,7799,7804,118,101,59,1,728,98,97,114,5,166,1,59,7812,1,166,4,4,99,101,105,111,7824,7829,7834,7846,114,59,3,55349,56503,109,105,59,1,8271,109,4,2,59,101,7841,7843,1,8765,59,1,8909,108,4,3,59,98,104,7855,7857,7860,1,92,59,1,10693,115,117,98,59,1,10184,4,2,108,109,7872,7885,108,4,2,59,101,7879,7881,1,8226,116,59,1,8226,112,4,3,59,69,101,7894,7896,7899,1,8782,59,1,10926,4,2,59,113,7905,7907,1,8783,59,1,8783,4,15,97,99,100,101,102,104,105,108,111,114,115,116,117,119,121,7942,8021,8075,8080,8121,8126,8157,8279,8295,8430,8446,8485,8491,8707,8726,4,3,99,112,114,7950,7956,8007,117,116,101,59,1,263,4,6,59,97,98,99,100,115,7970,7972,7977,7984,7998,8003,1,8745,110,100,59,1,10820,114,99,117,112,59,1,10825,4,2,97,117,7990,7994,112,59,1,10827,112,59,1,10823,111,116,59,1,10816,59,3,8745,65024,4,2,101,111,8013,8017,116,59,1,8257,110,59,1,711,4,4,97,101,105,117,8031,8046,8056,8061,4,2,112,114,8037,8041,115,59,1,10829,111,110,59,1,269,100,105,108,5,231,1,59,8054,1,231,114,99,59,1,265,112,115,4,2,59,115,8069,8071,1,10828,109,59,1,10832,111,116,59,1,267,4,3,100,109,110,8088,8097,8104,105,108,5,184,1,59,8095,1,184,112,116,121,118,59,1,10674,116,5,162,2,59,101,8112,8114,1,162,114,100,111,116,59,1,183,114,59,3,55349,56608,4,3,99,101,105,8134,8138,8154,121,59,1,1095,99,107,4,2,59,109,8146,8148,1,10003,97,114,107,59,1,10003,59,1,967,114,4,7,59,69,99,101,102,109,115,8174,8176,8179,8258,8261,8268,8273,1,9675,59,1,10691,4,3,59,101,108,8187,8189,8193,1,710,113,59,1,8791,101,4,2,97,100,8200,8223,114,114,111,119,4,2,108,114,8210,8216,101,102,116,59,1,8634,105,103,104,116,59,1,8635,4,5,82,83,97,99,100,8235,8238,8241,8246,8252,59,1,174,59,1,9416,115,116,59,1,8859,105,114,99,59,1,8858,97,115,104,59,1,8861,59,1,8791,110,105,110,116,59,1,10768,105,100,59,1,10991,99,105,114,59,1,10690,117,98,115,4,2,59,117,8288,8290,1,9827,105,116,59,1,9827,4,4,108,109,110,112,8305,8326,8376,8400,111,110,4,2,59,101,8313,8315,1,58,4,2,59,113,8321,8323,1,8788,59,1,8788,4,2,109,112,8332,8344,97,4,2,59,116,8339,8341,1,44,59,1,64,4,3,59,102,108,8352,8354,8358,1,8705,110,59,1,8728,101,4,2,109,120,8365,8371,101,110,116,59,1,8705,101,115,59,1,8450,4,2,103,105,8382,8395,4,2,59,100,8388,8390,1,8773,111,116,59,1,10861,110,116,59,1,8750,4,3,102,114,121,8408,8412,8417,59,3,55349,56660,111,100,59,1,8720,5,169,2,59,115,8424,8426,1,169,114,59,1,8471,4,2,97,111,8436,8441,114,114,59,1,8629,115,115,59,1,10007,4,2,99,117,8452,8457,114,59,3,55349,56504,4,2,98,112,8463,8474,4,2,59,101,8469,8471,1,10959,59,1,10961,4,2,59,101,8480,8482,1,10960,59,1,10962,100,111,116,59,1,8943,4,7,100,101,108,112,114,118,119,8507,8522,8536,8550,8600,8697,8702,97,114,114,4,2,108,114,8516,8519,59,1,10552,59,1,10549,4,2,112,115,8528,8532,114,59,1,8926,99,59,1,8927,97,114,114,4,2,59,112,8545,8547,1,8630,59,1,10557,4,6,59,98,99,100,111,115,8564,8566,8573,8587,8592,8596,1,8746,114,99,97,112,59,1,10824,4,2,97,117,8579,8583,112,59,1,10822,112,59,1,10826,111,116,59,1,8845,114,59,1,10821,59,3,8746,65024,4,4,97,108,114,118,8610,8623,8663,8672,114,114,4,2,59,109,8618,8620,1,8631,59,1,10556,121,4,3,101,118,119,8632,8651,8656,113,4,2,112,115,8639,8645,114,101,99,59,1,8926,117,99,99,59,1,8927,101,101,59,1,8910,101,100,103,101,59,1,8911,101,110,5,164,1,59,8670,1,164,101,97,114,114,111,119,4,2,108,114,8684,8690,101,102,116,59,1,8630,105,103,104,116,59,1,8631,101,101,59,1,8910,101,100,59,1,8911,4,2,99,105,8713,8721,111,110,105,110,116,59,1,8754,110,116,59,1,8753,108,99,116,121,59,1,9005,4,19,65,72,97,98,99,100,101,102,104,105,106,108,111,114,115,116,117,119,122,8773,8778,8783,8821,8839,8854,8887,8914,8930,8944,9036,9041,9058,9197,9227,9258,9281,9297,9305,114,114,59,1,8659,97,114,59,1,10597,4,4,103,108,114,115,8793,8799,8805,8809,103,101,114,59,1,8224,101,116,104,59,1,8504,114,59,1,8595,104,4,2,59,118,8816,8818,1,8208,59,1,8867,4,2,107,108,8827,8834,97,114,111,119,59,1,10511,97,99,59,1,733,4,2,97,121,8845,8851,114,111,110,59,1,271,59,1,1076,4,3,59,97,111,8862,8864,8880,1,8518,4,2,103,114,8870,8876,103,101,114,59,1,8225,114,59,1,8650,116,115,101,113,59,1,10871,4,3,103,108,109,8895,8902,8907,5,176,1,59,8900,1,176,116,97,59,1,948,112,116,121,118,59,1,10673,4,2,105,114,8920,8926,115,104,116,59,1,10623,59,3,55349,56609,97,114,4,2,108,114,8938,8941,59,1,8643,59,1,8642,4,5,97,101,103,115,118,8956,8986,8989,8996,9001,109,4,3,59,111,115,8965,8967,8983,1,8900,110,100,4,2,59,115,8975,8977,1,8900,117,105,116,59,1,9830,59,1,9830,59,1,168,97,109,109,97,59,1,989,105,110,59,1,8946,4,3,59,105,111,9009,9011,9031,1,247,100,101,5,247,2,59,111,9020,9022,1,247,110,116,105,109,101,115,59,1,8903,110,120,59,1,8903,99,121,59,1,1106,99,4,2,111,114,9048,9053,114,110,59,1,8990,111,112,59,1,8973,4,5,108,112,116,117,119,9070,9076,9081,9130,9144,108,97,114,59,1,36,102,59,3,55349,56661,4,5,59,101,109,112,115,9093,9095,9109,9116,9122,1,729,113,4,2,59,100,9102,9104,1,8784,111,116,59,1,8785,105,110,117,115,59,1,8760,108,117,115,59,1,8724,113,117,97,114,101,59,1,8865,98,108,101,98,97,114,119,101,100,103,101,59,1,8966,110,4,3,97,100,104,9153,9160,9172,114,114,111,119,59,1,8595,111,119,110,97,114,114,111,119,115,59,1,8650,97,114,112,111,111,110,4,2,108,114,9184,9190,101,102,116,59,1,8643,105,103,104,116,59,1,8642,4,2,98,99,9203,9211,107,97,114,111,119,59,1,10512,4,2,111,114,9217,9222,114,110,59,1,8991,111,112,59,1,8972,4,3,99,111,116,9235,9248,9252,4,2,114,121,9241,9245,59,3,55349,56505,59,1,1109,108,59,1,10742,114,111,107,59,1,273,4,2,100,114,9264,9269,111,116,59,1,8945,105,4,2,59,102,9276,9278,1,9663,59,1,9662,4,2,97,104,9287,9292,114,114,59,1,8693,97,114,59,1,10607,97,110,103,108,101,59,1,10662,4,2,99,105,9311,9315,121,59,1,1119,103,114,97,114,114,59,1,10239,4,18,68,97,99,100,101,102,103,108,109,110,111,112,113,114,115,116,117,120,9361,9376,9398,9439,9444,9447,9462,9495,9531,9585,9598,9614,9659,9755,9771,9792,9808,9826,4,2,68,111,9367,9372,111,116,59,1,10871,116,59,1,8785,4,2,99,115,9382,9392,117,116,101,5,233,1,59,9390,1,233,116,101,114,59,1,10862,4,4,97,105,111,121,9408,9414,9430,9436,114,111,110,59,1,283,114,4,2,59,99,9421,9423,1,8790,5,234,1,59,9428,1,234,108,111,110,59,1,8789,59,1,1101,111,116,59,1,279,59,1,8519,4,2,68,114,9453,9458,111,116,59,1,8786,59,3,55349,56610,4,3,59,114,115,9470,9472,9482,1,10906,97,118,101,5,232,1,59,9480,1,232,4,2,59,100,9488,9490,1,10902,111,116,59,1,10904,4,4,59,105,108,115,9505,9507,9515,9518,1,10905,110,116,101,114,115,59,1,9191,59,1,8467,4,2,59,100,9524,9526,1,10901,111,116,59,1,10903,4,3,97,112,115,9539,9544,9564,99,114,59,1,275,116,121,4,3,59,115,118,9554,9556,9561,1,8709,101,116,59,1,8709,59,1,8709,112,4,2,49,59,9571,9583,4,2,51,52,9577,9580,59,1,8196,59,1,8197,1,8195,4,2,103,115,9591,9594,59,1,331,112,59,1,8194,4,2,103,112,9604,9609,111,110,59,1,281,102,59,3,55349,56662,4,3,97,108,115,9622,9635,9640,114,4,2,59,115,9629,9631,1,8917,108,59,1,10723,117,115,59,1,10865,105,4,3,59,108,118,9649,9651,9656,1,949,111,110,59,1,949,59,1,1013,4,4,99,115,117,118,9669,9686,9716,9747,4,2,105,111,9675,9680,114,99,59,1,8790,108,111,110,59,1,8789,4,2,105,108,9692,9696,109,59,1,8770,97,110,116,4,2,103,108,9705,9710,116,114,59,1,10902,101,115,115,59,1,10901,4,3,97,101,105,9724,9729,9734,108,115,59,1,61,115,116,59,1,8799,118,4,2,59,68,9741,9743,1,8801,68,59,1,10872,112,97,114,115,108,59,1,10725,4,2,68,97,9761,9766,111,116,59,1,8787,114,114,59,1,10609,4,3,99,100,105,9779,9783,9788,114,59,1,8495,111,116,59,1,8784,109,59,1,8770,4,2,97,104,9798,9801,59,1,951,5,240,1,59,9806,1,240,4,2,109,114,9814,9822,108,5,235,1,59,9820,1,235,111,59,1,8364,4,3,99,105,112,9834,9838,9843,108,59,1,33,115,116,59,1,8707,4,2,101,111,9849,9859,99,116,97,116,105,111,110,59,1,8496,110,101,110,116,105,97,108,101,59,1,8519,4,12,97,99,101,102,105,106,108,110,111,112,114,115,9896,9910,9914,9921,9954,9960,9967,9989,9994,10027,10036,10164,108,108,105,110,103,100,111,116,115,101,113,59,1,8786,121,59,1,1092,109,97,108,101,59,1,9792,4,3,105,108,114,9929,9935,9950,108,105,103,59,1,64259,4,2,105,108,9941,9945,103,59,1,64256,105,103,59,1,64260,59,3,55349,56611,108,105,103,59,1,64257,108,105,103,59,3,102,106,4,3,97,108,116,9975,9979,9984,116,59,1,9837,105,103,59,1,64258,110,115,59,1,9649,111,102,59,1,402,4,2,112,114,10000,10005,102,59,3,55349,56663,4,2,97,107,10011,10016,108,108,59,1,8704,4,2,59,118,10022,10024,1,8916,59,1,10969,97,114,116,105,110,116,59,1,10765,4,2,97,111,10042,10159,4,2,99,115,10048,10155,4,6,49,50,51,52,53,55,10062,10102,10114,10135,10139,10151,4,6,50,51,52,53,54,56,10076,10083,10086,10093,10096,10099,5,189,1,59,10081,1,189,59,1,8531,5,188,1,59,10091,1,188,59,1,8533,59,1,8537,59,1,8539,4,2,51,53,10108,10111,59,1,8532,59,1,8534,4,3,52,53,56,10122,10129,10132,5,190,1,59,10127,1,190,59,1,8535,59,1,8540,53,59,1,8536,4,2,54,56,10145,10148,59,1,8538,59,1,8541,56,59,1,8542,108,59,1,8260,119,110,59,1,8994,99,114,59,3,55349,56507,4,17,69,97,98,99,100,101,102,103,105,106,108,110,111,114,115,116,118,10206,10217,10247,10254,10268,10273,10358,10363,10374,10380,10385,10406,10458,10464,10470,10497,10610,4,2,59,108,10212,10214,1,8807,59,1,10892,4,3,99,109,112,10225,10231,10244,117,116,101,59,1,501,109,97,4,2,59,100,10239,10241,1,947,59,1,989,59,1,10886,114,101,118,101,59,1,287,4,2,105,121,10260,10265,114,99,59,1,285,59,1,1075,111,116,59,1,289,4,4,59,108,113,115,10283,10285,10288,10308,1,8805,59,1,8923,4,3,59,113,115,10296,10298,10301,1,8805,59,1,8807,108,97,110,116,59,1,10878,4,4,59,99,100,108,10318,10320,10324,10345,1,10878,99,59,1,10921,111,116,4,2,59,111,10332,10334,1,10880,4,2,59,108,10340,10342,1,10882,59,1,10884,4,2,59,101,10351,10354,3,8923,65024,115,59,1,10900,114,59,3,55349,56612,4,2,59,103,10369,10371,1,8811,59,1,8921,109,101,108,59,1,8503,99,121,59,1,1107,4,4,59,69,97,106,10395,10397,10400,10403,1,8823,59,1,10898,59,1,10917,59,1,10916,4,4,69,97,101,115,10416,10419,10434,10453,59,1,8809,112,4,2,59,112,10426,10428,1,10890,114,111,120,59,1,10890,4,2,59,113,10440,10442,1,10888,4,2,59,113,10448,10450,1,10888,59,1,8809,105,109,59,1,8935,112,102,59,3,55349,56664,97,118,101,59,1,96,4,2,99,105,10476,10480,114,59,1,8458,109,4,3,59,101,108,10489,10491,10494,1,8819,59,1,10894,59,1,10896,5,62,6,59,99,100,108,113,114,10512,10514,10527,10532,10538,10545,1,62,4,2,99,105,10520,10523,59,1,10919,114,59,1,10874,111,116,59,1,8919,80,97,114,59,1,10645,117,101,115,116,59,1,10876,4,5,97,100,101,108,115,10557,10574,10579,10599,10605,4,2,112,114,10563,10570,112,114,111,120,59,1,10886,114,59,1,10616,111,116,59,1,8919,113,4,2,108,113,10586,10592,101,115,115,59,1,8923,108,101,115,115,59,1,10892,101,115,115,59,1,8823,105,109,59,1,8819,4,2,101,110,10616,10626,114,116,110,101,113,113,59,3,8809,65024,69,59,3,8809,65024,4,10,65,97,98,99,101,102,107,111,115,121,10653,10658,10713,10718,10724,10760,10765,10786,10850,10875,114,114,59,1,8660,4,4,105,108,109,114,10668,10674,10678,10684,114,115,112,59,1,8202,102,59,1,189,105,108,116,59,1,8459,4,2,100,114,10690,10695,99,121,59,1,1098,4,3,59,99,119,10703,10705,10710,1,8596,105,114,59,1,10568,59,1,8621,97,114,59,1,8463,105,114,99,59,1,293,4,3,97,108,114,10732,10748,10754,114,116,115,4,2,59,117,10741,10743,1,9829,105,116,59,1,9829,108,105,112,59,1,8230,99,111,110,59,1,8889,114,59,3,55349,56613,115,4,2,101,119,10772,10779,97,114,111,119,59,1,10533,97,114,111,119,59,1,10534,4,5,97,109,111,112,114,10798,10803,10809,10839,10844,114,114,59,1,8703,116,104,116,59,1,8763,107,4,2,108,114,10816,10827,101,102,116,97,114,114,111,119,59,1,8617,105,103,104,116,97,114,114,111,119,59,1,8618,102,59,3,55349,56665,98,97,114,59,1,8213,4,3,99,108,116,10858,10863,10869,114,59,3,55349,56509,97,115,104,59,1,8463,114,111,107,59,1,295,4,2,98,112,10881,10887,117,108,108,59,1,8259,104,101,110,59,1,8208,4,15,97,99,101,102,103,105,106,109,110,111,112,113,115,116,117,10925,10936,10958,10977,10990,11001,11039,11045,11101,11192,11220,11226,11237,11285,11299,99,117,116,101,5,237,1,59,10934,1,237,4,3,59,105,121,10944,10946,10955,1,8291,114,99,5,238,1,59,10953,1,238,59,1,1080,4,2,99,120,10964,10968,121,59,1,1077,99,108,5,161,1,59,10975,1,161,4,2,102,114,10983,10986,59,1,8660,59,3,55349,56614,114,97,118,101,5,236,1,59,10999,1,236,4,4,59,105,110,111,11011,11013,11028,11034,1,8520,4,2,105,110,11019,11024,110,116,59,1,10764,116,59,1,8749,102,105,110,59,1,10716,116,97,59,1,8489,108,105,103,59,1,307,4,3,97,111,112,11053,11092,11096,4,3,99,103,116,11061,11065,11088,114,59,1,299,4,3,101,108,112,11073,11076,11082,59,1,8465,105,110,101,59,1,8464,97,114,116,59,1,8465,104,59,1,305,102,59,1,8887,101,100,59,1,437,4,5,59,99,102,111,116,11113,11115,11121,11136,11142,1,8712,97,114,101,59,1,8453,105,110,4,2,59,116,11129,11131,1,8734,105,101,59,1,10717,100,111,116,59,1,305,4,5,59,99,101,108,112,11154,11156,11161,11179,11186,1,8747,97,108,59,1,8890,4,2,103,114,11167,11173,101,114,115,59,1,8484,99,97,108,59,1,8890,97,114,104,107,59,1,10775,114,111,100,59,1,10812,4,4,99,103,112,116,11202,11206,11211,11216,121,59,1,1105,111,110,59,1,303,102,59,3,55349,56666,97,59,1,953,114,111,100,59,1,10812,117,101,115,116,5,191,1,59,11235,1,191,4,2,99,105,11243,11248,114,59,3,55349,56510,110,4,5,59,69,100,115,118,11261,11263,11266,11271,11282,1,8712,59,1,8953,111,116,59,1,8949,4,2,59,118,11277,11279,1,8948,59,1,8947,59,1,8712,4,2,59,105,11291,11293,1,8290,108,100,101,59,1,297,4,2,107,109,11305,11310,99,121,59,1,1110,108,5,239,1,59,11316,1,239,4,6,99,102,109,111,115,117,11332,11346,11351,11357,11363,11380,4,2,105,121,11338,11343,114,99,59,1,309,59,1,1081,114,59,3,55349,56615,97,116,104,59,1,567,112,102,59,3,55349,56667,4,2,99,101,11369,11374,114,59,3,55349,56511,114,99,121,59,1,1112,107,99,121,59,1,1108,4,8,97,99,102,103,104,106,111,115,11404,11418,11433,11438,11445,11450,11455,11461,112,112,97,4,2,59,118,11413,11415,1,954,59,1,1008,4,2,101,121,11424,11430,100,105,108,59,1,311,59,1,1082,114,59,3,55349,56616,114,101,101,110,59,1,312,99,121,59,1,1093,99,121,59,1,1116,112,102,59,3,55349,56668,99,114,59,3,55349,56512,4,23,65,66,69,72,97,98,99,100,101,102,103,104,106,108,109,110,111,112,114,115,116,117,118,11515,11538,11544,11555,11560,11721,11780,11818,11868,12136,12160,12171,12203,12208,12246,12275,12327,12509,12523,12569,12641,12732,12752,4,3,97,114,116,11523,11528,11532,114,114,59,1,8666,114,59,1,8656,97,105,108,59,1,10523,97,114,114,59,1,10510,4,2,59,103,11550,11552,1,8806,59,1,10891,97,114,59,1,10594,4,9,99,101,103,109,110,112,113,114,116,11580,11586,11594,11600,11606,11624,11627,11636,11694,117,116,101,59,1,314,109,112,116,121,118,59,1,10676,114,97,110,59,1,8466,98,100,97,59,1,955,103,4,3,59,100,108,11615,11617,11620,1,10216,59,1,10641,101,59,1,10216,59,1,10885,117,111,5,171,1,59,11634,1,171,114,4,8,59,98,102,104,108,112,115,116,11655,11657,11669,11673,11677,11681,11685,11690,1,8592,4,2,59,102,11663,11665,1,8676,115,59,1,10527,115,59,1,10525,107,59,1,8617,112,59,1,8619,108,59,1,10553,105,109,59,1,10611,108,59,1,8610,4,3,59,97,101,11702,11704,11709,1,10923,105,108,59,1,10521,4,2,59,115,11715,11717,1,10925,59,3,10925,65024,4,3,97,98,114,11729,11734,11739,114,114,59,1,10508,114,107,59,1,10098,4,2,97,107,11745,11758,99,4,2,101,107,11752,11755,59,1,123,59,1,91,4,2,101,115,11764,11767,59,1,10635,108,4,2,100,117,11774,11777,59,1,10639,59,1,10637,4,4,97,101,117,121,11790,11796,11811,11815,114,111,110,59,1,318,4,2,100,105,11802,11807,105,108,59,1,316,108,59,1,8968,98,59,1,123,59,1,1083,4,4,99,113,114,115,11828,11832,11845,11864,97,59,1,10550,117,111,4,2,59,114,11840,11842,1,8220,59,1,8222,4,2,100,117,11851,11857,104,97,114,59,1,10599,115,104,97,114,59,1,10571,104,59,1,8626,4,5,59,102,103,113,115,11880,11882,12008,12011,12031,1,8804,116,4,5,97,104,108,114,116,11895,11913,11935,11947,11996,114,114,111,119,4,2,59,116,11905,11907,1,8592,97,105,108,59,1,8610,97,114,112,111,111,110,4,2,100,117,11925,11931,111,119,110,59,1,8637,112,59,1,8636,101,102,116,97,114,114,111,119,115,59,1,8647,105,103,104,116,4,3,97,104,115,11959,11974,11984,114,114,111,119,4,2,59,115,11969,11971,1,8596,59,1,8646,97,114,112,111,111,110,115,59,1,8651,113,117,105,103,97,114,114,111,119,59,1,8621,104,114,101,101,116,105,109,101,115,59,1,8907,59,1,8922,4,3,59,113,115,12019,12021,12024,1,8804,59,1,8806,108,97,110,116,59,1,10877,4,5,59,99,100,103,115,12043,12045,12049,12070,12083,1,10877,99,59,1,10920,111,116,4,2,59,111,12057,12059,1,10879,4,2,59,114,12065,12067,1,10881,59,1,10883,4,2,59,101,12076,12079,3,8922,65024,115,59,1,10899,4,5,97,100,101,103,115,12095,12103,12108,12126,12131,112,112,114,111,120,59,1,10885,111,116,59,1,8918,113,4,2,103,113,12115,12120,116,114,59,1,8922,103,116,114,59,1,10891,116,114,59,1,8822,105,109,59,1,8818,4,3,105,108,114,12144,12150,12156,115,104,116,59,1,10620,111,111,114,59,1,8970,59,3,55349,56617,4,2,59,69,12166,12168,1,8822,59,1,10897,4,2,97,98,12177,12198,114,4,2,100,117,12184,12187,59,1,8637,4,2,59,108,12193,12195,1,8636,59,1,10602,108,107,59,1,9604,99,121,59,1,1113,4,5,59,97,99,104,116,12220,12222,12227,12235,12241,1,8810,114,114,59,1,8647,111,114,110,101,114,59,1,8990,97,114,100,59,1,10603,114,105,59,1,9722,4,2,105,111,12252,12258,100,111,116,59,1,320,117,115,116,4,2,59,97,12267,12269,1,9136,99,104,101,59,1,9136,4,4,69,97,101,115,12285,12288,12303,12322,59,1,8808,112,4,2,59,112,12295,12297,1,10889,114,111,120,59,1,10889,4,2,59,113,12309,12311,1,10887,4,2,59,113,12317,12319,1,10887,59,1,8808,105,109,59,1,8934,4,8,97,98,110,111,112,116,119,122,12345,12359,12364,12421,12446,12467,12474,12490,4,2,110,114,12351,12355,103,59,1,10220,114,59,1,8701,114,107,59,1,10214,103,4,3,108,109,114,12373,12401,12409,101,102,116,4,2,97,114,12382,12389,114,114,111,119,59,1,10229,105,103,104,116,97,114,114,111,119,59,1,10231,97,112,115,116,111,59,1,10236,105,103,104,116,97,114,114,111,119,59,1,10230,112,97,114,114,111,119,4,2,108,114,12433,12439,101,102,116,59,1,8619,105,103,104,116,59,1,8620,4,3,97,102,108,12454,12458,12462,114,59,1,10629,59,3,55349,56669,117,115,59,1,10797,105,109,101,115,59,1,10804,4,2,97,98,12480,12485,115,116,59,1,8727,97,114,59,1,95,4,3,59,101,102,12498,12500,12506,1,9674,110,103,101,59,1,9674,59,1,10731,97,114,4,2,59,108,12517,12519,1,40,116,59,1,10643,4,5,97,99,104,109,116,12535,12540,12548,12561,12564,114,114,59,1,8646,111,114,110,101,114,59,1,8991,97,114,4,2,59,100,12556,12558,1,8651,59,1,10605,59,1,8206,114,105,59,1,8895,4,6,97,99,104,105,113,116,12583,12589,12594,12597,12614,12635,113,117,111,59,1,8249,114,59,3,55349,56513,59,1,8624,109,4,3,59,101,103,12606,12608,12611,1,8818,59,1,10893,59,1,10895,4,2,98,117,12620,12623,59,1,91,111,4,2,59,114,12630,12632,1,8216,59,1,8218,114,111,107,59,1,322,5,60,8,59,99,100,104,105,108,113,114,12660,12662,12675,12680,12686,12692,12698,12705,1,60,4,2,99,105,12668,12671,59,1,10918,114,59,1,10873,111,116,59,1,8918,114,101,101,59,1,8907,109,101,115,59,1,8905,97,114,114,59,1,10614,117,101,115,116,59,1,10875,4,2,80,105,12711,12716,97,114,59,1,10646,4,3,59,101,102,12724,12726,12729,1,9667,59,1,8884,59,1,9666,114,4,2,100,117,12739,12746,115,104,97,114,59,1,10570,104,97,114,59,1,10598,4,2,101,110,12758,12768,114,116,110,101,113,113,59,3,8808,65024,69,59,3,8808,65024,4,14,68,97,99,100,101,102,104,105,108,110,111,112,115,117,12803,12809,12893,12908,12914,12928,12933,12937,13011,13025,13032,13049,13052,13069,68,111,116,59,1,8762,4,4,99,108,112,114,12819,12827,12849,12887,114,5,175,1,59,12825,1,175,4,2,101,116,12833,12836,59,1,9794,4,2,59,101,12842,12844,1,10016,115,101,59,1,10016,4,2,59,115,12855,12857,1,8614,116,111,4,4,59,100,108,117,12869,12871,12877,12883,1,8614,111,119,110,59,1,8615,101,102,116,59,1,8612,112,59,1,8613,107,101,114,59,1,9646,4,2,111,121,12899,12905,109,109,97,59,1,10793,59,1,1084,97,115,104,59,1,8212,97,115,117,114,101,100,97,110,103,108,101,59,1,8737,114,59,3,55349,56618,111,59,1,8487,4,3,99,100,110,12945,12954,12985,114,111,5,181,1,59,12952,1,181,4,4,59,97,99,100,12964,12966,12971,12976,1,8739,115,116,59,1,42,105,114,59,1,10992,111,116,5,183,1,59,12983,1,183,117,115,4,3,59,98,100,12995,12997,13000,1,8722,59,1,8863,4,2,59,117,13006,13008,1,8760,59,1,10794,4,2,99,100,13017,13021,112,59,1,10971,114,59,1,8230,112,108,117,115,59,1,8723,4,2,100,112,13038,13044,101,108,115,59,1,8871,102,59,3,55349,56670,59,1,8723,4,2,99,116,13058,13063,114,59,3,55349,56514,112,111,115,59,1,8766,4,3,59,108,109,13077,13079,13087,1,956,116,105,109,97,112,59,1,8888,97,112,59,1,8888,4,24,71,76,82,86,97,98,99,100,101,102,103,104,105,106,108,109,111,112,114,115,116,117,118,119,13142,13165,13217,13229,13247,13330,13359,13414,13420,13508,13513,13579,13602,13626,13631,13762,13767,13855,13936,13995,14214,14285,14312,14432,4,2,103,116,13148,13152,59,3,8921,824,4,2,59,118,13158,13161,3,8811,8402,59,3,8811,824,4,3,101,108,116,13173,13200,13204,102,116,4,2,97,114,13181,13188,114,114,111,119,59,1,8653,105,103,104,116,97,114,114,111,119,59,1,8654,59,3,8920,824,4,2,59,118,13210,13213,3,8810,8402,59,3,8810,824,105,103,104,116,97,114,114,111,119,59,1,8655,4,2,68,100,13235,13241,97,115,104,59,1,8879,97,115,104,59,1,8878,4,5,98,99,110,112,116,13259,13264,13270,13275,13308,108,97,59,1,8711,117,116,101,59,1,324,103,59,3,8736,8402,4,5,59,69,105,111,112,13287,13289,13293,13298,13302,1,8777,59,3,10864,824,100,59,3,8779,824,115,59,1,329,114,111,120,59,1,8777,117,114,4,2,59,97,13316,13318,1,9838,108,4,2,59,115,13325,13327,1,9838,59,1,8469,4,2,115,117,13336,13344,112,5,160,1,59,13342,1,160,109,112,4,2,59,101,13352,13355,3,8782,824,59,3,8783,824,4,5,97,101,111,117,121,13371,13385,13391,13407,13411,4,2,112,114,13377,13380,59,1,10819,111,110,59,1,328,100,105,108,59,1,326,110,103,4,2,59,100,13399,13401,1,8775,111,116,59,3,10861,824,112,59,1,10818,59,1,1085,97,115,104,59,1,8211,4,7,59,65,97,100,113,115,120,13436,13438,13443,13466,13472,13478,13494,1,8800,114,114,59,1,8663,114,4,2,104,114,13450,13454,107,59,1,10532,4,2,59,111,13460,13462,1,8599,119,59,1,8599,111,116,59,3,8784,824,117,105,118,59,1,8802,4,2,101,105,13484,13489,97,114,59,1,10536,109,59,3,8770,824,105,115,116,4,2,59,115,13503,13505,1,8708,59,1,8708,114,59,3,55349,56619,4,4,69,101,115,116,13523,13527,13563,13568,59,3,8807,824,4,3,59,113,115,13535,13537,13559,1,8817,4,3,59,113,115,13545,13547,13551,1,8817,59,3,8807,824,108,97,110,116,59,3,10878,824,59,3,10878,824,105,109,59,1,8821,4,2,59,114,13574,13576,1,8815,59,1,8815,4,3,65,97,112,13587,13592,13597,114,114,59,1,8654,114,114,59,1,8622,97,114,59,1,10994,4,3,59,115,118,13610,13612,13623,1,8715,4,2,59,100,13618,13620,1,8956,59,1,8954,59,1,8715,99,121,59,1,1114,4,7,65,69,97,100,101,115,116,13647,13652,13656,13661,13665,13737,13742,114,114,59,1,8653,59,3,8806,824,114,114,59,1,8602,114,59,1,8229,4,4,59,102,113,115,13675,13677,13703,13725,1,8816,116,4,2,97,114,13684,13691,114,114,111,119,59,1,8602,105,103,104,116,97,114,114,111,119,59,1,8622,4,3,59,113,115,13711,13713,13717,1,8816,59,3,8806,824,108,97,110,116,59,3,10877,824,4,2,59,115,13731,13734,3,10877,824,59,1,8814,105,109,59,1,8820,4,2,59,114,13748,13750,1,8814,105,4,2,59,101,13757,13759,1,8938,59,1,8940,105,100,59,1,8740,4,2,112,116,13773,13778,102,59,3,55349,56671,5,172,3,59,105,110,13787,13789,13829,1,172,110,4,4,59,69,100,118,13800,13802,13806,13812,1,8713,59,3,8953,824,111,116,59,3,8949,824,4,3,97,98,99,13820,13823,13826,59,1,8713,59,1,8951,59,1,8950,105,4,2,59,118,13836,13838,1,8716,4,3,97,98,99,13846,13849,13852,59,1,8716,59,1,8958,59,1,8957,4,3,97,111,114,13863,13892,13899,114,4,4,59,97,115,116,13874,13876,13883,13888,1,8742,108,108,101,108,59,1,8742,108,59,3,11005,8421,59,3,8706,824,108,105,110,116,59,1,10772,4,3,59,99,101,13907,13909,13914,1,8832,117,101,59,1,8928,4,2,59,99,13920,13923,3,10927,824,4,2,59,101,13929,13931,1,8832,113,59,3,10927,824,4,4,65,97,105,116,13946,13951,13971,13982,114,114,59,1,8655,114,114,4,3,59,99,119,13961,13963,13967,1,8603,59,3,10547,824,59,3,8605,824,103,104,116,97,114,114,111,119,59,1,8603,114,105,4,2,59,101,13990,13992,1,8939,59,1,8941,4,7,99,104,105,109,112,113,117,14011,14036,14060,14080,14085,14090,14106,4,4,59,99,101,114,14021,14023,14028,14032,1,8833,117,101,59,1,8929,59,3,10928,824,59,3,55349,56515,111,114,116,4,2,109,112,14045,14050,105,100,59,1,8740,97,114,97,108,108,101,108,59,1,8742,109,4,2,59,101,14067,14069,1,8769,4,2,59,113,14075,14077,1,8772,59,1,8772,105,100,59,1,8740,97,114,59,1,8742,115,117,4,2,98,112,14098,14102,101,59,1,8930,101,59,1,8931,4,3,98,99,112,14114,14157,14171,4,4,59,69,101,115,14124,14126,14130,14133,1,8836,59,3,10949,824,59,1,8840,101,116,4,2,59,101,14141,14144,3,8834,8402,113,4,2,59,113,14151,14153,1,8840,59,3,10949,824,99,4,2,59,101,14164,14166,1,8833,113,59,3,10928,824,4,4,59,69,101,115,14181,14183,14187,14190,1,8837,59,3,10950,824,59,1,8841,101,116,4,2,59,101,14198,14201,3,8835,8402,113,4,2,59,113,14208,14210,1,8841,59,3,10950,824,4,4,103,105,108,114,14224,14228,14238,14242,108,59,1,8825,108,100,101,5,241,1,59,14236,1,241,103,59,1,8824,105,97,110,103,108,101,4,2,108,114,14254,14269,101,102,116,4,2,59,101,14263,14265,1,8938,113,59,1,8940,105,103,104,116,4,2,59,101,14279,14281,1,8939,113,59,1,8941,4,2,59,109,14291,14293,1,957,4,3,59,101,115,14301,14303,14308,1,35,114,111,59,1,8470,112,59,1,8199,4,9,68,72,97,100,103,105,108,114,115,14332,14338,14344,14349,14355,14369,14376,14408,14426,97,115,104,59,1,8877,97,114,114,59,1,10500,112,59,3,8781,8402,97,115,104,59,1,8876,4,2,101,116,14361,14365,59,3,8805,8402,59,3,62,8402,110,102,105,110,59,1,10718,4,3,65,101,116,14384,14389,14393,114,114,59,1,10498,59,3,8804,8402,4,2,59,114,14399,14402,3,60,8402,105,101,59,3,8884,8402,4,2,65,116,14414,14419,114,114,59,1,10499,114,105,101,59,3,8885,8402,105,109,59,3,8764,8402,4,3,65,97,110,14440,14445,14468,114,114,59,1,8662,114,4,2,104,114,14452,14456,107,59,1,10531,4,2,59,111,14462,14464,1,8598,119,59,1,8598,101,97,114,59,1,10535,4,18,83,97,99,100,101,102,103,104,105,108,109,111,112,114,115,116,117,118,14512,14515,14535,14560,14597,14603,14618,14643,14657,14662,14701,14741,14747,14769,14851,14877,14907,14916,59,1,9416,4,2,99,115,14521,14531,117,116,101,5,243,1,59,14529,1,243,116,59,1,8859,4,2,105,121,14541,14557,114,4,2,59,99,14548,14550,1,8858,5,244,1,59,14555,1,244,59,1,1086,4,5,97,98,105,111,115,14572,14577,14583,14587,14591,115,104,59,1,8861,108,97,99,59,1,337,118,59,1,10808,116,59,1,8857,111,108,100,59,1,10684,108,105,103,59,1,339,4,2,99,114,14609,14614,105,114,59,1,10687,59,3,55349,56620,4,3,111,114,116,14626,14630,14640,110,59,1,731,97,118,101,5,242,1,59,14638,1,242,59,1,10689,4,2,98,109,14649,14654,97,114,59,1,10677,59,1,937,110,116,59,1,8750,4,4,97,99,105,116,14672,14677,14693,14698,114,114,59,1,8634,4,2,105,114,14683,14687,114,59,1,10686,111,115,115,59,1,10683,110,101,59,1,8254,59,1,10688,4,3,97,101,105,14709,14714,14719,99,114,59,1,333,103,97,59,1,969,4,3,99,100,110,14727,14733,14736,114,111,110,59,1,959,59,1,10678,117,115,59,1,8854,112,102,59,3,55349,56672,4,3,97,101,108,14755,14759,14764,114,59,1,10679,114,112,59,1,10681,117,115,59,1,8853,4,7,59,97,100,105,111,115,118,14785,14787,14792,14831,14837,14841,14848,1,8744,114,114,59,1,8635,4,4,59,101,102,109,14802,14804,14817,14824,1,10845,114,4,2,59,111,14811,14813,1,8500,102,59,1,8500,5,170,1,59,14822,1,170,5,186,1,59,14829,1,186,103,111,102,59,1,8886,114,59,1,10838,108,111,112,101,59,1,10839,59,1,10843,4,3,99,108,111,14859,14863,14873,114,59,1,8500,97,115,104,5,248,1,59,14871,1,248,108,59,1,8856,105,4,2,108,109,14884,14893,100,101,5,245,1,59,14891,1,245,101,115,4,2,59,97,14901,14903,1,8855,115,59,1,10806,109,108,5,246,1,59,14914,1,246,98,97,114,59,1,9021,4,12,97,99,101,102,104,105,108,109,111,114,115,117,14948,14992,14996,15033,15038,15068,15090,15189,15192,15222,15427,15441,114,4,4,59,97,115,116,14959,14961,14976,14989,1,8741,5,182,2,59,108,14968,14970,1,182,108,101,108,59,1,8741,4,2,105,108,14982,14986,109,59,1,10995,59,1,11005,59,1,8706,121,59,1,1087,114,4,5,99,105,109,112,116,15009,15014,15019,15024,15027,110,116,59,1,37,111,100,59,1,46,105,108,59,1,8240,59,1,8869,101,110,107,59,1,8241,114,59,3,55349,56621,4,3,105,109,111,15046,15057,15063,4,2,59,118,15052,15054,1,966,59,1,981,109,97,116,59,1,8499,110,101,59,1,9742,4,3,59,116,118,15076,15078,15087,1,960,99,104,102,111,114,107,59,1,8916,59,1,982,4,2,97,117,15096,15119,110,4,2,99,107,15103,15115,107,4,2,59,104,15110,15112,1,8463,59,1,8462,118,59,1,8463,115,4,9,59,97,98,99,100,101,109,115,116,15140,15142,15148,15151,15156,15168,15171,15179,15184,1,43,99,105,114,59,1,10787,59,1,8862,105,114,59,1,10786,4,2,111,117,15162,15165,59,1,8724,59,1,10789,59,1,10866,110,5,177,1,59,15177,1,177,105,109,59,1,10790,119,111,59,1,10791,59,1,177,4,3,105,112,117,15200,15208,15213,110,116,105,110,116,59,1,10773,102,59,3,55349,56673,110,100,5,163,1,59,15220,1,163,4,10,59,69,97,99,101,105,110,111,115,117,15244,15246,15249,15253,15258,15334,15347,15367,15416,15421,1,8826,59,1,10931,112,59,1,10935,117,101,59,1,8828,4,2,59,99,15264,15266,1,10927,4,6,59,97,99,101,110,115,15280,15282,15290,15299,15303,15329,1,8826,112,112,114,111,120,59,1,10935,117,114,108,121,101,113,59,1,8828,113,59,1,10927,4,3,97,101,115,15311,15319,15324,112,112,114,111,120,59,1,10937,113,113,59,1,10933,105,109,59,1,8936,105,109,59,1,8830,109,101,4,2,59,115,15342,15344,1,8242,59,1,8473,4,3,69,97,115,15355,15358,15362,59,1,10933,112,59,1,10937,105,109,59,1,8936,4,3,100,102,112,15375,15378,15404,59,1,8719,4,3,97,108,115,15386,15392,15398,108,97,114,59,1,9006,105,110,101,59,1,8978,117,114,102,59,1,8979,4,2,59,116,15410,15412,1,8733,111,59,1,8733,105,109,59,1,8830,114,101,108,59,1,8880,4,2,99,105,15433,15438,114,59,3,55349,56517,59,1,968,110,99,115,112,59,1,8200,4,6,102,105,111,112,115,117,15462,15467,15472,15478,15485,15491,114,59,3,55349,56622,110,116,59,1,10764,112,102,59,3,55349,56674,114,105,109,101,59,1,8279,99,114,59,3,55349,56518,4,3,97,101,111,15499,15520,15534,116,4,2,101,105,15506,15515,114,110,105,111,110,115,59,1,8461,110,116,59,1,10774,115,116,4,2,59,101,15528,15530,1,63,113,59,1,8799,116,5,34,1,59,15540,1,34,4,21,65,66,72,97,98,99,100,101,102,104,105,108,109,110,111,112,114,115,116,117,120,15586,15609,15615,15620,15796,15855,15893,15931,15977,16001,16039,16183,16204,16222,16228,16285,16312,16318,16363,16408,16416,4,3,97,114,116,15594,15599,15603,114,114,59,1,8667,114,59,1,8658,97,105,108,59,1,10524,97,114,114,59,1,10511,97,114,59,1,10596,4,7,99,100,101,110,113,114,116,15636,15651,15656,15664,15687,15696,15770,4,2,101,117,15642,15646,59,3,8765,817,116,101,59,1,341,105,99,59,1,8730,109,112,116,121,118,59,1,10675,103,4,4,59,100,101,108,15675,15677,15680,15683,1,10217,59,1,10642,59,1,10661,101,59,1,10217,117,111,5,187,1,59,15694,1,187,114,4,11,59,97,98,99,102,104,108,112,115,116,119,15721,15723,15727,15739,15742,15746,15750,15754,15758,15763,15767,1,8594,112,59,1,10613,4,2,59,102,15733,15735,1,8677,115,59,1,10528,59,1,10547,115,59,1,10526,107,59,1,8618,112,59,1,8620,108,59,1,10565,105,109,59,1,10612,108,59,1,8611,59,1,8605,4,2,97,105,15776,15781,105,108,59,1,10522,111,4,2,59,110,15788,15790,1,8758,97,108,115,59,1,8474,4,3,97,98,114,15804,15809,15814,114,114,59,1,10509,114,107,59,1,10099,4,2,97,107,15820,15833,99,4,2,101,107,15827,15830,59,1,125,59,1,93,4,2,101,115,15839,15842,59,1,10636,108,4,2,100,117,15849,15852,59,1,10638,59,1,10640,4,4,97,101,117,121,15865,15871,15886,15890,114,111,110,59,1,345,4,2,100,105,15877,15882,105,108,59,1,343,108,59,1,8969,98,59,1,125,59,1,1088,4,4,99,108,113,115,15903,15907,15914,15927,97,59,1,10551,100,104,97,114,59,1,10601,117,111,4,2,59,114,15922,15924,1,8221,59,1,8221,104,59,1,8627,4,3,97,99,103,15939,15966,15970,108,4,4,59,105,112,115,15950,15952,15957,15963,1,8476,110,101,59,1,8475,97,114,116,59,1,8476,59,1,8477,116,59,1,9645,5,174,1,59,15975,1,174,4,3,105,108,114,15985,15991,15997,115,104,116,59,1,10621,111,111,114,59,1,8971,59,3,55349,56623,4,2,97,111,16007,16028,114,4,2,100,117,16014,16017,59,1,8641,4,2,59,108,16023,16025,1,8640,59,1,10604,4,2,59,118,16034,16036,1,961,59,1,1009,4,3,103,110,115,16047,16167,16171,104,116,4,6,97,104,108,114,115,116,16063,16081,16103,16130,16143,16155,114,114,111,119,4,2,59,116,16073,16075,1,8594,97,105,108,59,1,8611,97,114,112,111,111,110,4,2,100,117,16093,16099,111,119,110,59,1,8641,112,59,1,8640,101,102,116,4,2,97,104,16112,16120,114,114,111,119,115,59,1,8644,97,114,112,111,111,110,115,59,1,8652,105,103,104,116,97,114,114,111,119,115,59,1,8649,113,117,105,103,97,114,114,111,119,59,1,8605,104,114,101,101,116,105,109,101,115,59,1,8908,103,59,1,730,105,110,103,100,111,116,115,101,113,59,1,8787,4,3,97,104,109,16191,16196,16201,114,114,59,1,8644,97,114,59,1,8652,59,1,8207,111,117,115,116,4,2,59,97,16214,16216,1,9137,99,104,101,59,1,9137,109,105,100,59,1,10990,4,4,97,98,112,116,16238,16252,16257,16278,4,2,110,114,16244,16248,103,59,1,10221,114,59,1,8702,114,107,59,1,10215,4,3,97,102,108,16265,16269,16273,114,59,1,10630,59,3,55349,56675,117,115,59,1,10798,105,109,101,115,59,1,10805,4,2,97,112,16291,16304,114,4,2,59,103,16298,16300,1,41,116,59,1,10644,111,108,105,110,116,59,1,10770,97,114,114,59,1,8649,4,4,97,99,104,113,16328,16334,16339,16342,113,117,111,59,1,8250,114,59,3,55349,56519,59,1,8625,4,2,98,117,16348,16351,59,1,93,111,4,2,59,114,16358,16360,1,8217,59,1,8217,4,3,104,105,114,16371,16377,16383,114,101,101,59,1,8908,109,101,115,59,1,8906,105,4,4,59,101,102,108,16394,16396,16399,16402,1,9657,59,1,8885,59,1,9656,116,114,105,59,1,10702,108,117,104,97,114,59,1,10600,59,1,8478,4,19,97,98,99,100,101,102,104,105,108,109,111,112,113,114,115,116,117,119,122,16459,16466,16472,16572,16590,16672,16687,16746,16844,16850,16924,16963,16988,17115,17121,17154,17206,17614,17656,99,117,116,101,59,1,347,113,117,111,59,1,8218,4,10,59,69,97,99,101,105,110,112,115,121,16494,16496,16499,16513,16518,16531,16536,16556,16564,16569,1,8827,59,1,10932,4,2,112,114,16505,16508,59,1,10936,111,110,59,1,353,117,101,59,1,8829,4,2,59,100,16524,16526,1,10928,105,108,59,1,351,114,99,59,1,349,4,3,69,97,115,16544,16547,16551,59,1,10934,112,59,1,10938,105,109,59,1,8937,111,108,105,110,116,59,1,10771,105,109,59,1,8831,59,1,1089,111,116,4,3,59,98,101,16582,16584,16587,1,8901,59,1,8865,59,1,10854,4,7,65,97,99,109,115,116,120,16606,16611,16634,16642,16646,16652,16668,114,114,59,1,8664,114,4,2,104,114,16618,16622,107,59,1,10533,4,2,59,111,16628,16630,1,8600,119,59,1,8600,116,5,167,1,59,16640,1,167,105,59,1,59,119,97,114,59,1,10537,109,4,2,105,110,16659,16665,110,117,115,59,1,8726,59,1,8726,116,59,1,10038,114,4,2,59,111,16679,16682,3,55349,56624,119,110,59,1,8994,4,4,97,99,111,121,16697,16702,16716,16739,114,112,59,1,9839,4,2,104,121,16708,16713,99,121,59,1,1097,59,1,1096,114,116,4,2,109,112,16724,16729,105,100,59,1,8739,97,114,97,108,108,101,108,59,1,8741,5,173,1,59,16744,1,173,4,2,103,109,16752,16770,109,97,4,3,59,102,118,16762,16764,16767,1,963,59,1,962,59,1,962,4,8,59,100,101,103,108,110,112,114,16788,16790,16795,16806,16817,16828,16832,16838,1,8764,111,116,59,1,10858,4,2,59,113,16801,16803,1,8771,59,1,8771,4,2,59,69,16812,16814,1,10910,59,1,10912,4,2,59,69,16823,16825,1,10909,59,1,10911,101,59,1,8774,108,117,115,59,1,10788,97,114,114,59,1,10610,97,114,114,59,1,8592,4,4,97,101,105,116,16860,16883,16891,16904,4,2,108,115,16866,16878,108,115,101,116,109,105,110,117,115,59,1,8726,104,112,59,1,10803,112,97,114,115,108,59,1,10724,4,2,100,108,16897,16900,59,1,8739,101,59,1,8995,4,2,59,101,16910,16912,1,10922,4,2,59,115,16918,16920,1,10924,59,3,10924,65024,4,3,102,108,112,16932,16938,16958,116,99,121,59,1,1100,4,2,59,98,16944,16946,1,47,4,2,59,97,16952,16954,1,10692,114,59,1,9023,102,59,3,55349,56676,97,4,2,100,114,16970,16985,101,115,4,2,59,117,16978,16980,1,9824,105,116,59,1,9824,59,1,8741,4,3,99,115,117,16996,17028,17089,4,2,97,117,17002,17015,112,4,2,59,115,17009,17011,1,8851,59,3,8851,65024,112,4,2,59,115,17022,17024,1,8852,59,3,8852,65024,117,4,2,98,112,17035,17062,4,3,59,101,115,17043,17045,17048,1,8847,59,1,8849,101,116,4,2,59,101,17056,17058,1,8847,113,59,1,8849,4,3,59,101,115,17070,17072,17075,1,8848,59,1,8850,101,116,4,2,59,101,17083,17085,1,8848,113,59,1,8850,4,3,59,97,102,17097,17099,17112,1,9633,114,4,2,101,102,17106,17109,59,1,9633,59,1,9642,59,1,9642,97,114,114,59,1,8594,4,4,99,101,109,116,17131,17136,17142,17148,114,59,3,55349,56520,116,109,110,59,1,8726,105,108,101,59,1,8995,97,114,102,59,1,8902,4,2,97,114,17160,17172,114,4,2,59,102,17167,17169,1,9734,59,1,9733,4,2,97,110,17178,17202,105,103,104,116,4,2,101,112,17188,17197,112,115,105,108,111,110,59,1,1013,104,105,59,1,981,115,59,1,175,4,5,98,99,109,110,112,17218,17351,17420,17423,17427,4,9,59,69,100,101,109,110,112,114,115,17238,17240,17243,17248,17261,17267,17279,17285,17291,1,8834,59,1,10949,111,116,59,1,10941,4,2,59,100,17254,17256,1,8838,111,116,59,1,10947,117,108,116,59,1,10945,4,2,69,101,17273,17276,59,1,10955,59,1,8842,108,117,115,59,1,10943,97,114,114,59,1,10617,4,3,101,105,117,17299,17335,17339,116,4,3,59,101,110,17308,17310,17322,1,8834,113,4,2,59,113,17317,17319,1,8838,59,1,10949,101,113,4,2,59,113,17330,17332,1,8842,59,1,10955,109,59,1,10951,4,2,98,112,17345,17348,59,1,10965,59,1,10963,99,4,6,59,97,99,101,110,115,17366,17368,17376,17385,17389,17415,1,8827,112,112,114,111,120,59,1,10936,117,114,108,121,101,113,59,1,8829,113,59,1,10928,4,3,97,101,115,17397,17405,17410,112,112,114,111,120,59,1,10938,113,113,59,1,10934,105,109,59,1,8937,105,109,59,1,8831,59,1,8721,103,59,1,9834,4,13,49,50,51,59,69,100,101,104,108,109,110,112,115,17455,17462,17469,17476,17478,17481,17496,17509,17524,17530,17536,17548,17554,5,185,1,59,17460,1,185,5,178,1,59,17467,1,178,5,179,1,59,17474,1,179,1,8835,59,1,10950,4,2,111,115,17487,17491,116,59,1,10942,117,98,59,1,10968,4,2,59,100,17502,17504,1,8839,111,116,59,1,10948,115,4,2,111,117,17516,17520,108,59,1,10185,98,59,1,10967,97,114,114,59,1,10619,117,108,116,59,1,10946,4,2,69,101,17542,17545,59,1,10956,59,1,8843,108,117,115,59,1,10944,4,3,101,105,117,17562,17598,17602,116,4,3,59,101,110,17571,17573,17585,1,8835,113,4,2,59,113,17580,17582,1,8839,59,1,10950,101,113,4,2,59,113,17593,17595,1,8843,59,1,10956,109,59,1,10952,4,2,98,112,17608,17611,59,1,10964,59,1,10966,4,3,65,97,110,17622,17627,17650,114,114,59,1,8665,114,4,2,104,114,17634,17638,107,59,1,10534,4,2,59,111,17644,17646,1,8601,119,59,1,8601,119,97,114,59,1,10538,108,105,103,5,223,1,59,17664,1,223,4,13,97,98,99,100,101,102,104,105,111,112,114,115,119,17694,17709,17714,17737,17742,17749,17754,17860,17905,17957,17964,18090,18122,4,2,114,117,17700,17706,103,101,116,59,1,8982,59,1,964,114,107,59,1,9140,4,3,97,101,121,17722,17728,17734,114,111,110,59,1,357,100,105,108,59,1,355,59,1,1090,111,116,59,1,8411,108,114,101,99,59,1,8981,114,59,3,55349,56625,4,4,101,105,107,111,17764,17805,17836,17851,4,2,114,116,17770,17786,101,4,2,52,102,17777,17780,59,1,8756,111,114,101,59,1,8756,97,4,3,59,115,118,17795,17797,17802,1,952,121,109,59,1,977,59,1,977,4,2,99,110,17811,17831,107,4,2,97,115,17818,17826,112,112,114,111,120,59,1,8776,105,109,59,1,8764,115,112,59,1,8201,4,2,97,115,17842,17846,112,59,1,8776,105,109,59,1,8764,114,110,5,254,1,59,17858,1,254,4,3,108,109,110,17868,17873,17901,100,101,59,1,732,101,115,5,215,3,59,98,100,17884,17886,17898,1,215,4,2,59,97,17892,17894,1,8864,114,59,1,10801,59,1,10800,116,59,1,8749,4,3,101,112,115,17913,17917,17953,97,59,1,10536,4,4,59,98,99,102,17927,17929,17934,17939,1,8868,111,116,59,1,9014,105,114,59,1,10993,4,2,59,111,17945,17948,3,55349,56677,114,107,59,1,10970,97,59,1,10537,114,105,109,101,59,1,8244,4,3,97,105,112,17972,17977,18082,100,101,59,1,8482,4,7,97,100,101,109,112,115,116,17993,18051,18056,18059,18066,18072,18076,110,103,108,101,4,5,59,100,108,113,114,18009,18011,18017,18032,18035,1,9653,111,119,110,59,1,9663,101,102,116,4,2,59,101,18026,18028,1,9667,113,59,1,8884,59,1,8796,105,103,104,116,4,2,59,101,18045,18047,1,9657,113,59,1,8885,111,116,59,1,9708,59,1,8796,105,110,117,115,59,1,10810,108,117,115,59,1,10809,98,59,1,10701,105,109,101,59,1,10811,101,122,105,117,109,59,1,9186,4,3,99,104,116,18098,18111,18116,4,2,114,121,18104,18108,59,3,55349,56521,59,1,1094,99,121,59,1,1115,114,111,107,59,1,359,4,2,105,111,18128,18133,120,116,59,1,8812,104,101,97,100,4,2,108,114,18143,18154,101,102,116,97,114,114,111,119,59,1,8606,105,103,104,116,97,114,114,111,119,59,1,8608,4,18,65,72,97,98,99,100,102,103,104,108,109,111,112,114,115,116,117,119,18204,18209,18214,18234,18250,18268,18292,18308,18319,18343,18379,18397,18413,18504,18547,18553,18584,18603,114,114,59,1,8657,97,114,59,1,10595,4,2,99,114,18220,18230,117,116,101,5,250,1,59,18228,1,250,114,59,1,8593,114,4,2,99,101,18241,18245,121,59,1,1118,118,101,59,1,365,4,2,105,121,18256,18265,114,99,5,251,1,59,18263,1,251,59,1,1091,4,3,97,98,104,18276,18281,18287,114,114,59,1,8645,108,97,99,59,1,369,97,114,59,1,10606,4,2,105,114,18298,18304,115,104,116,59,1,10622,59,3,55349,56626,114,97,118,101,5,249,1,59,18317,1,249,4,2,97,98,18325,18338,114,4,2,108,114,18332,18335,59,1,8639,59,1,8638,108,107,59,1,9600,4,2,99,116,18349,18374,4,2,111,114,18355,18369,114,110,4,2,59,101,18363,18365,1,8988,114,59,1,8988,111,112,59,1,8975,114,105,59,1,9720,4,2,97,108,18385,18390,99,114,59,1,363,5,168,1,59,18395,1,168,4,2,103,112,18403,18408,111,110,59,1,371,102,59,3,55349,56678,4,6,97,100,104,108,115,117,18427,18434,18445,18470,18475,18494,114,114,111,119,59,1,8593,111,119,110,97,114,114,111,119,59,1,8597,97,114,112,111,111,110,4,2,108,114,18457,18463,101,102,116,59,1,8639,105,103,104,116,59,1,8638,117,115,59,1,8846,105,4,3,59,104,108,18484,18486,18489,1,965,59,1,978,111,110,59,1,965,112,97,114,114,111,119,115,59,1,8648,4,3,99,105,116,18512,18537,18542,4,2,111,114,18518,18532,114,110,4,2,59,101,18526,18528,1,8989,114,59,1,8989,111,112,59,1,8974,110,103,59,1,367,114,105,59,1,9721,99,114,59,3,55349,56522,4,3,100,105,114,18561,18566,18572,111,116,59,1,8944,108,100,101,59,1,361,105,4,2,59,102,18579,18581,1,9653,59,1,9652,4,2,97,109,18590,18595,114,114,59,1,8648,108,5,252,1,59,18601,1,252,97,110,103,108,101,59,1,10663,4,15,65,66,68,97,99,100,101,102,108,110,111,112,114,115,122,18643,18648,18661,18667,18847,18851,18857,18904,18909,18915,18931,18937,18943,18949,18996,114,114,59,1,8661,97,114,4,2,59,118,18656,18658,1,10984,59,1,10985,97,115,104,59,1,8872,4,2,110,114,18673,18679,103,114,116,59,1,10652,4,7,101,107,110,112,114,115,116,18695,18704,18711,18720,18742,18754,18810,112,115,105,108,111,110,59,1,1013,97,112,112,97,59,1,1008,111,116,104,105,110,103,59,1,8709,4,3,104,105,114,18728,18732,18735,105,59,1,981,59,1,982,111,112,116,111,59,1,8733,4,2,59,104,18748,18750,1,8597,111,59,1,1009,4,2,105,117,18760,18766,103,109,97,59,1,962,4,2,98,112,18772,18791,115,101,116,110,101,113,4,2,59,113,18784,18787,3,8842,65024,59,3,10955,65024,115,101,116,110,101,113,4,2,59,113,18803,18806,3,8843,65024,59,3,10956,65024,4,2,104,114,18816,18822,101,116,97,59,1,977,105,97,110,103,108,101,4,2,108,114,18834,18840,101,102,116,59,1,8882,105,103,104,116,59,1,8883,121,59,1,1074,97,115,104,59,1,8866,4,3,101,108,114,18865,18884,18890,4,3,59,98,101,18873,18875,18880,1,8744,97,114,59,1,8891,113,59,1,8794,108,105,112,59,1,8942,4,2,98,116,18896,18901,97,114,59,1,124,59,1,124,114,59,3,55349,56627,116,114,105,59,1,8882,115,117,4,2,98,112,18923,18927,59,3,8834,8402,59,3,8835,8402,112,102,59,3,55349,56679,114,111,112,59,1,8733,116,114,105,59,1,8883,4,2,99,117,18955,18960,114,59,3,55349,56523,4,2,98,112,18966,18981,110,4,2,69,101,18973,18977,59,3,10955,65024,59,3,8842,65024,110,4,2,69,101,18988,18992,59,3,10956,65024,59,3,8843,65024,105,103,122,97,103,59,1,10650,4,7,99,101,102,111,112,114,115,19020,19026,19061,19066,19072,19075,19089,105,114,99,59,1,373,4,2,100,105,19032,19055,4,2,98,103,19038,19043,97,114,59,1,10847,101,4,2,59,113,19050,19052,1,8743,59,1,8793,101,114,112,59,1,8472,114,59,3,55349,56628,112,102,59,3,55349,56680,59,1,8472,4,2,59,101,19081,19083,1,8768,97,116,104,59,1,8768,99,114,59,3,55349,56524,4,14,99,100,102,104,105,108,109,110,111,114,115,117,118,119,19125,19146,19152,19157,19173,19176,19192,19197,19202,19236,19252,19269,19286,19291,4,3,97,105,117,19133,19137,19142,112,59,1,8898,114,99,59,1,9711,112,59,1,8899,116,114,105,59,1,9661,114,59,3,55349,56629,4,2,65,97,19163,19168,114,114,59,1,10234,114,114,59,1,10231,59,1,958,4,2,65,97,19182,19187,114,114,59,1,10232,114,114,59,1,10229,97,112,59,1,10236,105,115,59,1,8955,4,3,100,112,116,19210,19215,19230,111,116,59,1,10752,4,2,102,108,19221,19225,59,3,55349,56681,117,115,59,1,10753,105,109,101,59,1,10754,4,2,65,97,19242,19247,114,114,59,1,10233,114,114,59,1,10230,4,2,99,113,19258,19263,114,59,3,55349,56525,99,117,112,59,1,10758,4,2,112,116,19275,19281,108,117,115,59,1,10756,114,105,59,1,9651,101,101,59,1,8897,101,100,103,101,59,1,8896,4,8,97,99,101,102,105,111,115,117,19316,19335,19349,19357,19362,19367,19373,19379,99,4,2,117,121,19323,19332,116,101,5,253,1,59,19330,1,253,59,1,1103,4,2,105,121,19341,19346,114,99,59,1,375,59,1,1099,110,5,165,1,59,19355,1,165,114,59,3,55349,56630,99,121,59,1,1111,112,102,59,3,55349,56682,99,114,59,3,55349,56526,4,2,99,109,19385,19389,121,59,1,1102,108,5,255,1,59,19395,1,255,4,10,97,99,100,101,102,104,105,111,115,119,19419,19426,19441,19446,19462,19467,19472,19480,19486,19492,99,117,116,101,59,1,378,4,2,97,121,19432,19438,114,111,110,59,1,382,59,1,1079,111,116,59,1,380,4,2,101,116,19452,19458,116,114,102,59,1,8488,97,59,1,950,114,59,3,55349,56631,99,121,59,1,1078,103,114,97,114,114,59,1,8669,112,102,59,3,55349,56683,99,114,59,3,55349,56527,4,2,106,110,19498,19501,59,1,8205,106,59,1,8204]);

    //Aliases
    const $$1 = unicode.CODE_POINTS;
    const $$ = unicode.CODE_POINT_SEQUENCES;

    //C1 Unicode control character reference replacements
    const C1_CONTROLS_REFERENCE_REPLACEMENTS = {
        0x80: 0x20ac,
        0x82: 0x201a,
        0x83: 0x0192,
        0x84: 0x201e,
        0x85: 0x2026,
        0x86: 0x2020,
        0x87: 0x2021,
        0x88: 0x02c6,
        0x89: 0x2030,
        0x8a: 0x0160,
        0x8b: 0x2039,
        0x8c: 0x0152,
        0x8e: 0x017d,
        0x91: 0x2018,
        0x92: 0x2019,
        0x93: 0x201c,
        0x94: 0x201d,
        0x95: 0x2022,
        0x96: 0x2013,
        0x97: 0x2014,
        0x98: 0x02dc,
        0x99: 0x2122,
        0x9a: 0x0161,
        0x9b: 0x203a,
        0x9c: 0x0153,
        0x9e: 0x017e,
        0x9f: 0x0178
    };

    // Named entity tree flags
    const HAS_DATA_FLAG = 1 << 0;
    const DATA_DUPLET_FLAG = 1 << 1;
    const HAS_BRANCHES_FLAG = 1 << 2;
    const MAX_BRANCH_MARKER_VALUE = HAS_DATA_FLAG | DATA_DUPLET_FLAG | HAS_BRANCHES_FLAG;

    //States
    const DATA_STATE = 'DATA_STATE';
    const RCDATA_STATE = 'RCDATA_STATE';
    const RAWTEXT_STATE = 'RAWTEXT_STATE';
    const SCRIPT_DATA_STATE = 'SCRIPT_DATA_STATE';
    const PLAINTEXT_STATE = 'PLAINTEXT_STATE';
    const TAG_OPEN_STATE = 'TAG_OPEN_STATE';
    const END_TAG_OPEN_STATE = 'END_TAG_OPEN_STATE';
    const TAG_NAME_STATE = 'TAG_NAME_STATE';
    const RCDATA_LESS_THAN_SIGN_STATE = 'RCDATA_LESS_THAN_SIGN_STATE';
    const RCDATA_END_TAG_OPEN_STATE = 'RCDATA_END_TAG_OPEN_STATE';
    const RCDATA_END_TAG_NAME_STATE = 'RCDATA_END_TAG_NAME_STATE';
    const RAWTEXT_LESS_THAN_SIGN_STATE = 'RAWTEXT_LESS_THAN_SIGN_STATE';
    const RAWTEXT_END_TAG_OPEN_STATE = 'RAWTEXT_END_TAG_OPEN_STATE';
    const RAWTEXT_END_TAG_NAME_STATE = 'RAWTEXT_END_TAG_NAME_STATE';
    const SCRIPT_DATA_LESS_THAN_SIGN_STATE = 'SCRIPT_DATA_LESS_THAN_SIGN_STATE';
    const SCRIPT_DATA_END_TAG_OPEN_STATE = 'SCRIPT_DATA_END_TAG_OPEN_STATE';
    const SCRIPT_DATA_END_TAG_NAME_STATE = 'SCRIPT_DATA_END_TAG_NAME_STATE';
    const SCRIPT_DATA_ESCAPE_START_STATE = 'SCRIPT_DATA_ESCAPE_START_STATE';
    const SCRIPT_DATA_ESCAPE_START_DASH_STATE = 'SCRIPT_DATA_ESCAPE_START_DASH_STATE';
    const SCRIPT_DATA_ESCAPED_STATE = 'SCRIPT_DATA_ESCAPED_STATE';
    const SCRIPT_DATA_ESCAPED_DASH_STATE = 'SCRIPT_DATA_ESCAPED_DASH_STATE';
    const SCRIPT_DATA_ESCAPED_DASH_DASH_STATE = 'SCRIPT_DATA_ESCAPED_DASH_DASH_STATE';
    const SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN_STATE = 'SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN_STATE';
    const SCRIPT_DATA_ESCAPED_END_TAG_OPEN_STATE = 'SCRIPT_DATA_ESCAPED_END_TAG_OPEN_STATE';
    const SCRIPT_DATA_ESCAPED_END_TAG_NAME_STATE = 'SCRIPT_DATA_ESCAPED_END_TAG_NAME_STATE';
    const SCRIPT_DATA_DOUBLE_ESCAPE_START_STATE = 'SCRIPT_DATA_DOUBLE_ESCAPE_START_STATE';
    const SCRIPT_DATA_DOUBLE_ESCAPED_STATE = 'SCRIPT_DATA_DOUBLE_ESCAPED_STATE';
    const SCRIPT_DATA_DOUBLE_ESCAPED_DASH_STATE = 'SCRIPT_DATA_DOUBLE_ESCAPED_DASH_STATE';
    const SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH_STATE = 'SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH_STATE';
    const SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN_STATE = 'SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN_STATE';
    const SCRIPT_DATA_DOUBLE_ESCAPE_END_STATE = 'SCRIPT_DATA_DOUBLE_ESCAPE_END_STATE';
    const BEFORE_ATTRIBUTE_NAME_STATE = 'BEFORE_ATTRIBUTE_NAME_STATE';
    const ATTRIBUTE_NAME_STATE = 'ATTRIBUTE_NAME_STATE';
    const AFTER_ATTRIBUTE_NAME_STATE = 'AFTER_ATTRIBUTE_NAME_STATE';
    const BEFORE_ATTRIBUTE_VALUE_STATE = 'BEFORE_ATTRIBUTE_VALUE_STATE';
    const ATTRIBUTE_VALUE_DOUBLE_QUOTED_STATE = 'ATTRIBUTE_VALUE_DOUBLE_QUOTED_STATE';
    const ATTRIBUTE_VALUE_SINGLE_QUOTED_STATE = 'ATTRIBUTE_VALUE_SINGLE_QUOTED_STATE';
    const ATTRIBUTE_VALUE_UNQUOTED_STATE = 'ATTRIBUTE_VALUE_UNQUOTED_STATE';
    const AFTER_ATTRIBUTE_VALUE_QUOTED_STATE = 'AFTER_ATTRIBUTE_VALUE_QUOTED_STATE';
    const SELF_CLOSING_START_TAG_STATE = 'SELF_CLOSING_START_TAG_STATE';
    const BOGUS_COMMENT_STATE = 'BOGUS_COMMENT_STATE';
    const MARKUP_DECLARATION_OPEN_STATE = 'MARKUP_DECLARATION_OPEN_STATE';
    const COMMENT_START_STATE = 'COMMENT_START_STATE';
    const COMMENT_START_DASH_STATE = 'COMMENT_START_DASH_STATE';
    const COMMENT_STATE = 'COMMENT_STATE';
    const COMMENT_LESS_THAN_SIGN_STATE = 'COMMENT_LESS_THAN_SIGN_STATE';
    const COMMENT_LESS_THAN_SIGN_BANG_STATE = 'COMMENT_LESS_THAN_SIGN_BANG_STATE';
    const COMMENT_LESS_THAN_SIGN_BANG_DASH_STATE = 'COMMENT_LESS_THAN_SIGN_BANG_DASH_STATE';
    const COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH_STATE = 'COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH_STATE';
    const COMMENT_END_DASH_STATE = 'COMMENT_END_DASH_STATE';
    const COMMENT_END_STATE = 'COMMENT_END_STATE';
    const COMMENT_END_BANG_STATE = 'COMMENT_END_BANG_STATE';
    const DOCTYPE_STATE = 'DOCTYPE_STATE';
    const BEFORE_DOCTYPE_NAME_STATE = 'BEFORE_DOCTYPE_NAME_STATE';
    const DOCTYPE_NAME_STATE = 'DOCTYPE_NAME_STATE';
    const AFTER_DOCTYPE_NAME_STATE = 'AFTER_DOCTYPE_NAME_STATE';
    const AFTER_DOCTYPE_PUBLIC_KEYWORD_STATE = 'AFTER_DOCTYPE_PUBLIC_KEYWORD_STATE';
    const BEFORE_DOCTYPE_PUBLIC_IDENTIFIER_STATE = 'BEFORE_DOCTYPE_PUBLIC_IDENTIFIER_STATE';
    const DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED_STATE = 'DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED_STATE';
    const DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED_STATE = 'DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED_STATE';
    const AFTER_DOCTYPE_PUBLIC_IDENTIFIER_STATE = 'AFTER_DOCTYPE_PUBLIC_IDENTIFIER_STATE';
    const BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS_STATE = 'BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS_STATE';
    const AFTER_DOCTYPE_SYSTEM_KEYWORD_STATE = 'AFTER_DOCTYPE_SYSTEM_KEYWORD_STATE';
    const BEFORE_DOCTYPE_SYSTEM_IDENTIFIER_STATE = 'BEFORE_DOCTYPE_SYSTEM_IDENTIFIER_STATE';
    const DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED_STATE = 'DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED_STATE';
    const DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED_STATE = 'DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED_STATE';
    const AFTER_DOCTYPE_SYSTEM_IDENTIFIER_STATE = 'AFTER_DOCTYPE_SYSTEM_IDENTIFIER_STATE';
    const BOGUS_DOCTYPE_STATE = 'BOGUS_DOCTYPE_STATE';
    const CDATA_SECTION_STATE = 'CDATA_SECTION_STATE';
    const CDATA_SECTION_BRACKET_STATE = 'CDATA_SECTION_BRACKET_STATE';
    const CDATA_SECTION_END_STATE = 'CDATA_SECTION_END_STATE';
    const CHARACTER_REFERENCE_STATE = 'CHARACTER_REFERENCE_STATE';
    const NAMED_CHARACTER_REFERENCE_STATE = 'NAMED_CHARACTER_REFERENCE_STATE';
    const AMBIGUOUS_AMPERSAND_STATE = 'AMBIGUOS_AMPERSAND_STATE';
    const NUMERIC_CHARACTER_REFERENCE_STATE = 'NUMERIC_CHARACTER_REFERENCE_STATE';
    const HEXADEMICAL_CHARACTER_REFERENCE_START_STATE = 'HEXADEMICAL_CHARACTER_REFERENCE_START_STATE';
    const DECIMAL_CHARACTER_REFERENCE_START_STATE = 'DECIMAL_CHARACTER_REFERENCE_START_STATE';
    const HEXADEMICAL_CHARACTER_REFERENCE_STATE = 'HEXADEMICAL_CHARACTER_REFERENCE_STATE';
    const DECIMAL_CHARACTER_REFERENCE_STATE = 'DECIMAL_CHARACTER_REFERENCE_STATE';
    const NUMERIC_CHARACTER_REFERENCE_END_STATE = 'NUMERIC_CHARACTER_REFERENCE_END_STATE';

    //Utils

    //OPTIMIZATION: these utility functions should not be moved out of this module. V8 Crankshaft will not inline
    //this functions if they will be situated in another module due to context switch.
    //Always perform inlining check before modifying this functions ('node --trace-inlining').
    function isWhitespace(cp) {
        return cp === $$1.SPACE || cp === $$1.LINE_FEED || cp === $$1.TABULATION || cp === $$1.FORM_FEED;
    }

    function isAsciiDigit(cp) {
        return cp >= $$1.DIGIT_0 && cp <= $$1.DIGIT_9;
    }

    function isAsciiUpper(cp) {
        return cp >= $$1.LATIN_CAPITAL_A && cp <= $$1.LATIN_CAPITAL_Z;
    }

    function isAsciiLower(cp) {
        return cp >= $$1.LATIN_SMALL_A && cp <= $$1.LATIN_SMALL_Z;
    }

    function isAsciiLetter(cp) {
        return isAsciiLower(cp) || isAsciiUpper(cp);
    }

    function isAsciiAlphaNumeric(cp) {
        return isAsciiLetter(cp) || isAsciiDigit(cp);
    }

    function isAsciiUpperHexDigit(cp) {
        return cp >= $$1.LATIN_CAPITAL_A && cp <= $$1.LATIN_CAPITAL_F;
    }

    function isAsciiLowerHexDigit(cp) {
        return cp >= $$1.LATIN_SMALL_A && cp <= $$1.LATIN_SMALL_F;
    }

    function isAsciiHexDigit(cp) {
        return isAsciiDigit(cp) || isAsciiUpperHexDigit(cp) || isAsciiLowerHexDigit(cp);
    }

    function toAsciiLowerCodePoint(cp) {
        return cp + 0x0020;
    }

    //NOTE: String.fromCharCode() function can handle only characters from BMP subset.
    //So, we need to workaround this manually.
    //(see: https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/fromCharCode#Getting_it_to_work_with_higher_values)
    function toChar(cp) {
        if (cp <= 0xffff) {
            return String.fromCharCode(cp);
        }

        cp -= 0x10000;
        return String.fromCharCode(((cp >>> 10) & 0x3ff) | 0xd800) + String.fromCharCode(0xdc00 | (cp & 0x3ff));
    }

    function toAsciiLowerChar(cp) {
        return String.fromCharCode(toAsciiLowerCodePoint(cp));
    }

    function findNamedEntityTreeBranch(nodeIx, cp) {
        const branchCount = namedEntityData[++nodeIx];
        let lo = ++nodeIx;
        let hi = lo + branchCount - 1;

        while (lo <= hi) {
            const mid = (lo + hi) >>> 1;
            const midCp = namedEntityData[mid];

            if (midCp < cp) {
                lo = mid + 1;
            } else if (midCp > cp) {
                hi = mid - 1;
            } else {
                return namedEntityData[mid + branchCount];
            }
        }

        return -1;
    }

    //Tokenizer
    class Tokenizer {
        constructor() {
            this.preprocessor = new preprocessor();

            this.tokenQueue = [];

            this.allowCDATA = false;

            this.state = DATA_STATE;
            this.returnState = '';

            this.charRefCode = -1;
            this.tempBuff = [];
            this.lastStartTagName = '';

            this.consumedAfterSnapshot = -1;
            this.active = false;

            this.currentCharacterToken = null;
            this.currentToken = null;
            this.currentAttr = null;
        }

        //Errors
        _err() {
            // NOTE: err reporting is noop by default. Enabled by mixin.
        }

        _errOnNextCodePoint(err) {
            this._consume();
            this._err(err);
            this._unconsume();
        }

        //API
        getNextToken() {
            while (!this.tokenQueue.length && this.active) {
                this.consumedAfterSnapshot = 0;

                const cp = this._consume();

                if (!this._ensureHibernation()) {
                    this[this.state](cp);
                }
            }

            return this.tokenQueue.shift();
        }

        write(chunk, isLastChunk) {
            this.active = true;
            this.preprocessor.write(chunk, isLastChunk);
        }

        insertHtmlAtCurrentPos(chunk) {
            this.active = true;
            this.preprocessor.insertHtmlAtCurrentPos(chunk);
        }

        //Hibernation
        _ensureHibernation() {
            if (this.preprocessor.endOfChunkHit) {
                for (; this.consumedAfterSnapshot > 0; this.consumedAfterSnapshot--) {
                    this.preprocessor.retreat();
                }

                this.active = false;
                this.tokenQueue.push({ type: Tokenizer.HIBERNATION_TOKEN });

                return true;
            }

            return false;
        }

        //Consumption
        _consume() {
            this.consumedAfterSnapshot++;
            return this.preprocessor.advance();
        }

        _unconsume() {
            this.consumedAfterSnapshot--;
            this.preprocessor.retreat();
        }

        _reconsumeInState(state) {
            this.state = state;
            this._unconsume();
        }

        _consumeSequenceIfMatch(pattern, startCp, caseSensitive) {
            let consumedCount = 0;
            let isMatch = true;
            const patternLength = pattern.length;
            let patternPos = 0;
            let cp = startCp;
            let patternCp = void 0;

            for (; patternPos < patternLength; patternPos++) {
                if (patternPos > 0) {
                    cp = this._consume();
                    consumedCount++;
                }

                if (cp === $$1.EOF) {
                    isMatch = false;
                    break;
                }

                patternCp = pattern[patternPos];

                if (cp !== patternCp && (caseSensitive || cp !== toAsciiLowerCodePoint(patternCp))) {
                    isMatch = false;
                    break;
                }
            }

            if (!isMatch) {
                while (consumedCount--) {
                    this._unconsume();
                }
            }

            return isMatch;
        }

        //Temp buffer
        _isTempBufferEqualToScriptString() {
            if (this.tempBuff.length !== $$.SCRIPT_STRING.length) {
                return false;
            }

            for (let i = 0; i < this.tempBuff.length; i++) {
                if (this.tempBuff[i] !== $$.SCRIPT_STRING[i]) {
                    return false;
                }
            }

            return true;
        }

        //Token creation
        _createStartTagToken() {
            this.currentToken = {
                type: Tokenizer.START_TAG_TOKEN,
                tagName: '',
                selfClosing: false,
                ackSelfClosing: false,
                attrs: []
            };
        }

        _createEndTagToken() {
            this.currentToken = {
                type: Tokenizer.END_TAG_TOKEN,
                tagName: '',
                selfClosing: false,
                attrs: []
            };
        }

        _createCommentToken() {
            this.currentToken = {
                type: Tokenizer.COMMENT_TOKEN,
                data: ''
            };
        }

        _createDoctypeToken(initialName) {
            this.currentToken = {
                type: Tokenizer.DOCTYPE_TOKEN,
                name: initialName,
                forceQuirks: false,
                publicId: null,
                systemId: null
            };
        }

        _createCharacterToken(type, ch) {
            this.currentCharacterToken = {
                type: type,
                chars: ch
            };
        }

        _createEOFToken() {
            this.currentToken = { type: Tokenizer.EOF_TOKEN };
        }

        //Tag attributes
        _createAttr(attrNameFirstCh) {
            this.currentAttr = {
                name: attrNameFirstCh,
                value: ''
            };
        }

        _leaveAttrName(toState) {
            if (Tokenizer.getTokenAttr(this.currentToken, this.currentAttr.name) === null) {
                this.currentToken.attrs.push(this.currentAttr);
            } else {
                this._err(errorCodes.duplicateAttribute);
            }

            this.state = toState;
        }

        _leaveAttrValue(toState) {
            this.state = toState;
        }

        //Token emission
        _emitCurrentToken() {
            this._emitCurrentCharacterToken();

            const ct = this.currentToken;

            this.currentToken = null;

            //NOTE: store emited start tag's tagName to determine is the following end tag token is appropriate.
            if (ct.type === Tokenizer.START_TAG_TOKEN) {
                this.lastStartTagName = ct.tagName;
            } else if (ct.type === Tokenizer.END_TAG_TOKEN) {
                if (ct.attrs.length > 0) {
                    this._err(errorCodes.endTagWithAttributes);
                }

                if (ct.selfClosing) {
                    this._err(errorCodes.endTagWithTrailingSolidus);
                }
            }

            this.tokenQueue.push(ct);
        }

        _emitCurrentCharacterToken() {
            if (this.currentCharacterToken) {
                this.tokenQueue.push(this.currentCharacterToken);
                this.currentCharacterToken = null;
            }
        }

        _emitEOFToken() {
            this._createEOFToken();
            this._emitCurrentToken();
        }

        //Characters emission

        //OPTIMIZATION: specification uses only one type of character tokens (one token per character).
        //This causes a huge memory overhead and a lot of unnecessary parser loops. parse5 uses 3 groups of characters.
        //If we have a sequence of characters that belong to the same group, parser can process it
        //as a single solid character token.
        //So, there are 3 types of character tokens in parse5:
        //1)NULL_CHARACTER_TOKEN - \u0000-character sequences (e.g. '\u0000\u0000\u0000')
        //2)WHITESPACE_CHARACTER_TOKEN - any whitespace/new-line character sequences (e.g. '\n  \r\t   \f')
        //3)CHARACTER_TOKEN - any character sequence which don't belong to groups 1 and 2 (e.g. 'abcdef1234@@#$%^')
        _appendCharToCurrentCharacterToken(type, ch) {
            if (this.currentCharacterToken && this.currentCharacterToken.type !== type) {
                this._emitCurrentCharacterToken();
            }

            if (this.currentCharacterToken) {
                this.currentCharacterToken.chars += ch;
            } else {
                this._createCharacterToken(type, ch);
            }
        }

        _emitCodePoint(cp) {
            let type = Tokenizer.CHARACTER_TOKEN;

            if (isWhitespace(cp)) {
                type = Tokenizer.WHITESPACE_CHARACTER_TOKEN;
            } else if (cp === $$1.NULL) {
                type = Tokenizer.NULL_CHARACTER_TOKEN;
            }

            this._appendCharToCurrentCharacterToken(type, toChar(cp));
        }

        _emitSeveralCodePoints(codePoints) {
            for (let i = 0; i < codePoints.length; i++) {
                this._emitCodePoint(codePoints[i]);
            }
        }

        //NOTE: used then we emit character explicitly. This is always a non-whitespace and a non-null character.
        //So we can avoid additional checks here.
        _emitChars(ch) {
            this._appendCharToCurrentCharacterToken(Tokenizer.CHARACTER_TOKEN, ch);
        }

        // Character reference helpers
        _matchNamedCharacterReference(startCp) {
            let result = null;
            let excess = 1;
            let i = findNamedEntityTreeBranch(0, startCp);

            this.tempBuff.push(startCp);

            while (i > -1) {
                const current = namedEntityData[i];
                const inNode = current < MAX_BRANCH_MARKER_VALUE;
                const nodeWithData = inNode && current & HAS_DATA_FLAG;

                if (nodeWithData) {
                    //NOTE: we use greedy search, so we continue lookup at this point
                    result = current & DATA_DUPLET_FLAG ? [namedEntityData[++i], namedEntityData[++i]] : [namedEntityData[++i]];
                    excess = 0;
                }

                const cp = this._consume();

                this.tempBuff.push(cp);
                excess++;

                if (cp === $$1.EOF) {
                    break;
                }

                if (inNode) {
                    i = current & HAS_BRANCHES_FLAG ? findNamedEntityTreeBranch(i, cp) : -1;
                } else {
                    i = cp === current ? ++i : -1;
                }
            }

            while (excess--) {
                this.tempBuff.pop();
                this._unconsume();
            }

            return result;
        }

        _isCharacterReferenceInAttribute() {
            return (
                this.returnState === ATTRIBUTE_VALUE_DOUBLE_QUOTED_STATE ||
                this.returnState === ATTRIBUTE_VALUE_SINGLE_QUOTED_STATE ||
                this.returnState === ATTRIBUTE_VALUE_UNQUOTED_STATE
            );
        }

        _isCharacterReferenceAttributeQuirk(withSemicolon) {
            if (!withSemicolon && this._isCharacterReferenceInAttribute()) {
                const nextCp = this._consume();

                this._unconsume();

                return nextCp === $$1.EQUALS_SIGN || isAsciiAlphaNumeric(nextCp);
            }

            return false;
        }

        _flushCodePointsConsumedAsCharacterReference() {
            if (this._isCharacterReferenceInAttribute()) {
                for (let i = 0; i < this.tempBuff.length; i++) {
                    this.currentAttr.value += toChar(this.tempBuff[i]);
                }
            } else {
                this._emitSeveralCodePoints(this.tempBuff);
            }

            this.tempBuff = [];
        }

        // State machine

        // Data state
        //------------------------------------------------------------------
        [DATA_STATE](cp) {
            this.preprocessor.dropParsedChunk();

            if (cp === $$1.LESS_THAN_SIGN) {
                this.state = TAG_OPEN_STATE;
            } else if (cp === $$1.AMPERSAND) {
                this.returnState = DATA_STATE;
                this.state = CHARACTER_REFERENCE_STATE;
            } else if (cp === $$1.NULL) {
                this._err(errorCodes.unexpectedNullCharacter);
                this._emitCodePoint(cp);
            } else if (cp === $$1.EOF) {
                this._emitEOFToken();
            } else {
                this._emitCodePoint(cp);
            }
        }

        //  RCDATA state
        //------------------------------------------------------------------
        [RCDATA_STATE](cp) {
            this.preprocessor.dropParsedChunk();

            if (cp === $$1.AMPERSAND) {
                this.returnState = RCDATA_STATE;
                this.state = CHARACTER_REFERENCE_STATE;
            } else if (cp === $$1.LESS_THAN_SIGN) {
                this.state = RCDATA_LESS_THAN_SIGN_STATE;
            } else if (cp === $$1.NULL) {
                this._err(errorCodes.unexpectedNullCharacter);
                this._emitChars(unicode.REPLACEMENT_CHARACTER);
            } else if (cp === $$1.EOF) {
                this._emitEOFToken();
            } else {
                this._emitCodePoint(cp);
            }
        }

        // RAWTEXT state
        //------------------------------------------------------------------
        [RAWTEXT_STATE](cp) {
            this.preprocessor.dropParsedChunk();

            if (cp === $$1.LESS_THAN_SIGN) {
                this.state = RAWTEXT_LESS_THAN_SIGN_STATE;
            } else if (cp === $$1.NULL) {
                this._err(errorCodes.unexpectedNullCharacter);
                this._emitChars(unicode.REPLACEMENT_CHARACTER);
            } else if (cp === $$1.EOF) {
                this._emitEOFToken();
            } else {
                this._emitCodePoint(cp);
            }
        }

        // Script data state
        //------------------------------------------------------------------
        [SCRIPT_DATA_STATE](cp) {
            this.preprocessor.dropParsedChunk();

            if (cp === $$1.LESS_THAN_SIGN) {
                this.state = SCRIPT_DATA_LESS_THAN_SIGN_STATE;
            } else if (cp === $$1.NULL) {
                this._err(errorCodes.unexpectedNullCharacter);
                this._emitChars(unicode.REPLACEMENT_CHARACTER);
            } else if (cp === $$1.EOF) {
                this._emitEOFToken();
            } else {
                this._emitCodePoint(cp);
            }
        }

        // PLAINTEXT state
        //------------------------------------------------------------------
        [PLAINTEXT_STATE](cp) {
            this.preprocessor.dropParsedChunk();

            if (cp === $$1.NULL) {
                this._err(errorCodes.unexpectedNullCharacter);
                this._emitChars(unicode.REPLACEMENT_CHARACTER);
            } else if (cp === $$1.EOF) {
                this._emitEOFToken();
            } else {
                this._emitCodePoint(cp);
            }
        }

        // Tag open state
        //------------------------------------------------------------------
        [TAG_OPEN_STATE](cp) {
            if (cp === $$1.EXCLAMATION_MARK) {
                this.state = MARKUP_DECLARATION_OPEN_STATE;
            } else if (cp === $$1.SOLIDUS) {
                this.state = END_TAG_OPEN_STATE;
            } else if (isAsciiLetter(cp)) {
                this._createStartTagToken();
                this._reconsumeInState(TAG_NAME_STATE);
            } else if (cp === $$1.QUESTION_MARK) {
                this._err(errorCodes.unexpectedQuestionMarkInsteadOfTagName);
                this._createCommentToken();
                this._reconsumeInState(BOGUS_COMMENT_STATE);
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofBeforeTagName);
                this._emitChars('<');
                this._emitEOFToken();
            } else {
                this._err(errorCodes.invalidFirstCharacterOfTagName);
                this._emitChars('<');
                this._reconsumeInState(DATA_STATE);
            }
        }

        // End tag open state
        //------------------------------------------------------------------
        [END_TAG_OPEN_STATE](cp) {
            if (isAsciiLetter(cp)) {
                this._createEndTagToken();
                this._reconsumeInState(TAG_NAME_STATE);
            } else if (cp === $$1.GREATER_THAN_SIGN) {
                this._err(errorCodes.missingEndTagName);
                this.state = DATA_STATE;
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofBeforeTagName);
                this._emitChars('</');
                this._emitEOFToken();
            } else {
                this._err(errorCodes.invalidFirstCharacterOfTagName);
                this._createCommentToken();
                this._reconsumeInState(BOGUS_COMMENT_STATE);
            }
        }

        // Tag name state
        //------------------------------------------------------------------
        [TAG_NAME_STATE](cp) {
            if (isWhitespace(cp)) {
                this.state = BEFORE_ATTRIBUTE_NAME_STATE;
            } else if (cp === $$1.SOLIDUS) {
                this.state = SELF_CLOSING_START_TAG_STATE;
            } else if (cp === $$1.GREATER_THAN_SIGN) {
                this.state = DATA_STATE;
                this._emitCurrentToken();
            } else if (isAsciiUpper(cp)) {
                this.currentToken.tagName += toAsciiLowerChar(cp);
            } else if (cp === $$1.NULL) {
                this._err(errorCodes.unexpectedNullCharacter);
                this.currentToken.tagName += unicode.REPLACEMENT_CHARACTER;
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInTag);
                this._emitEOFToken();
            } else {
                this.currentToken.tagName += toChar(cp);
            }
        }

        // RCDATA less-than sign state
        //------------------------------------------------------------------
        [RCDATA_LESS_THAN_SIGN_STATE](cp) {
            if (cp === $$1.SOLIDUS) {
                this.tempBuff = [];
                this.state = RCDATA_END_TAG_OPEN_STATE;
            } else {
                this._emitChars('<');
                this._reconsumeInState(RCDATA_STATE);
            }
        }

        // RCDATA end tag open state
        //------------------------------------------------------------------
        [RCDATA_END_TAG_OPEN_STATE](cp) {
            if (isAsciiLetter(cp)) {
                this._createEndTagToken();
                this._reconsumeInState(RCDATA_END_TAG_NAME_STATE);
            } else {
                this._emitChars('</');
                this._reconsumeInState(RCDATA_STATE);
            }
        }

        // RCDATA end tag name state
        //------------------------------------------------------------------
        [RCDATA_END_TAG_NAME_STATE](cp) {
            if (isAsciiUpper(cp)) {
                this.currentToken.tagName += toAsciiLowerChar(cp);
                this.tempBuff.push(cp);
            } else if (isAsciiLower(cp)) {
                this.currentToken.tagName += toChar(cp);
                this.tempBuff.push(cp);
            } else {
                if (this.lastStartTagName === this.currentToken.tagName) {
                    if (isWhitespace(cp)) {
                        this.state = BEFORE_ATTRIBUTE_NAME_STATE;
                        return;
                    }

                    if (cp === $$1.SOLIDUS) {
                        this.state = SELF_CLOSING_START_TAG_STATE;
                        return;
                    }

                    if (cp === $$1.GREATER_THAN_SIGN) {
                        this.state = DATA_STATE;
                        this._emitCurrentToken();
                        return;
                    }
                }

                this._emitChars('</');
                this._emitSeveralCodePoints(this.tempBuff);
                this._reconsumeInState(RCDATA_STATE);
            }
        }

        // RAWTEXT less-than sign state
        //------------------------------------------------------------------
        [RAWTEXT_LESS_THAN_SIGN_STATE](cp) {
            if (cp === $$1.SOLIDUS) {
                this.tempBuff = [];
                this.state = RAWTEXT_END_TAG_OPEN_STATE;
            } else {
                this._emitChars('<');
                this._reconsumeInState(RAWTEXT_STATE);
            }
        }

        // RAWTEXT end tag open state
        //------------------------------------------------------------------
        [RAWTEXT_END_TAG_OPEN_STATE](cp) {
            if (isAsciiLetter(cp)) {
                this._createEndTagToken();
                this._reconsumeInState(RAWTEXT_END_TAG_NAME_STATE);
            } else {
                this._emitChars('</');
                this._reconsumeInState(RAWTEXT_STATE);
            }
        }

        // RAWTEXT end tag name state
        //------------------------------------------------------------------
        [RAWTEXT_END_TAG_NAME_STATE](cp) {
            if (isAsciiUpper(cp)) {
                this.currentToken.tagName += toAsciiLowerChar(cp);
                this.tempBuff.push(cp);
            } else if (isAsciiLower(cp)) {
                this.currentToken.tagName += toChar(cp);
                this.tempBuff.push(cp);
            } else {
                if (this.lastStartTagName === this.currentToken.tagName) {
                    if (isWhitespace(cp)) {
                        this.state = BEFORE_ATTRIBUTE_NAME_STATE;
                        return;
                    }

                    if (cp === $$1.SOLIDUS) {
                        this.state = SELF_CLOSING_START_TAG_STATE;
                        return;
                    }

                    if (cp === $$1.GREATER_THAN_SIGN) {
                        this._emitCurrentToken();
                        this.state = DATA_STATE;
                        return;
                    }
                }

                this._emitChars('</');
                this._emitSeveralCodePoints(this.tempBuff);
                this._reconsumeInState(RAWTEXT_STATE);
            }
        }

        // Script data less-than sign state
        //------------------------------------------------------------------
        [SCRIPT_DATA_LESS_THAN_SIGN_STATE](cp) {
            if (cp === $$1.SOLIDUS) {
                this.tempBuff = [];
                this.state = SCRIPT_DATA_END_TAG_OPEN_STATE;
            } else if (cp === $$1.EXCLAMATION_MARK) {
                this.state = SCRIPT_DATA_ESCAPE_START_STATE;
                this._emitChars('<!');
            } else {
                this._emitChars('<');
                this._reconsumeInState(SCRIPT_DATA_STATE);
            }
        }

        // Script data end tag open state
        //------------------------------------------------------------------
        [SCRIPT_DATA_END_TAG_OPEN_STATE](cp) {
            if (isAsciiLetter(cp)) {
                this._createEndTagToken();
                this._reconsumeInState(SCRIPT_DATA_END_TAG_NAME_STATE);
            } else {
                this._emitChars('</');
                this._reconsumeInState(SCRIPT_DATA_STATE);
            }
        }

        // Script data end tag name state
        //------------------------------------------------------------------
        [SCRIPT_DATA_END_TAG_NAME_STATE](cp) {
            if (isAsciiUpper(cp)) {
                this.currentToken.tagName += toAsciiLowerChar(cp);
                this.tempBuff.push(cp);
            } else if (isAsciiLower(cp)) {
                this.currentToken.tagName += toChar(cp);
                this.tempBuff.push(cp);
            } else {
                if (this.lastStartTagName === this.currentToken.tagName) {
                    if (isWhitespace(cp)) {
                        this.state = BEFORE_ATTRIBUTE_NAME_STATE;
                        return;
                    } else if (cp === $$1.SOLIDUS) {
                        this.state = SELF_CLOSING_START_TAG_STATE;
                        return;
                    } else if (cp === $$1.GREATER_THAN_SIGN) {
                        this._emitCurrentToken();
                        this.state = DATA_STATE;
                        return;
                    }
                }

                this._emitChars('</');
                this._emitSeveralCodePoints(this.tempBuff);
                this._reconsumeInState(SCRIPT_DATA_STATE);
            }
        }

        // Script data escape start state
        //------------------------------------------------------------------
        [SCRIPT_DATA_ESCAPE_START_STATE](cp) {
            if (cp === $$1.HYPHEN_MINUS) {
                this.state = SCRIPT_DATA_ESCAPE_START_DASH_STATE;
                this._emitChars('-');
            } else {
                this._reconsumeInState(SCRIPT_DATA_STATE);
            }
        }

        // Script data escape start dash state
        //------------------------------------------------------------------
        [SCRIPT_DATA_ESCAPE_START_DASH_STATE](cp) {
            if (cp === $$1.HYPHEN_MINUS) {
                this.state = SCRIPT_DATA_ESCAPED_DASH_DASH_STATE;
                this._emitChars('-');
            } else {
                this._reconsumeInState(SCRIPT_DATA_STATE);
            }
        }

        // Script data escaped state
        //------------------------------------------------------------------
        [SCRIPT_DATA_ESCAPED_STATE](cp) {
            if (cp === $$1.HYPHEN_MINUS) {
                this.state = SCRIPT_DATA_ESCAPED_DASH_STATE;
                this._emitChars('-');
            } else if (cp === $$1.LESS_THAN_SIGN) {
                this.state = SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN_STATE;
            } else if (cp === $$1.NULL) {
                this._err(errorCodes.unexpectedNullCharacter);
                this._emitChars(unicode.REPLACEMENT_CHARACTER);
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInScriptHtmlCommentLikeText);
                this._emitEOFToken();
            } else {
                this._emitCodePoint(cp);
            }
        }

        // Script data escaped dash state
        //------------------------------------------------------------------
        [SCRIPT_DATA_ESCAPED_DASH_STATE](cp) {
            if (cp === $$1.HYPHEN_MINUS) {
                this.state = SCRIPT_DATA_ESCAPED_DASH_DASH_STATE;
                this._emitChars('-');
            } else if (cp === $$1.LESS_THAN_SIGN) {
                this.state = SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN_STATE;
            } else if (cp === $$1.NULL) {
                this._err(errorCodes.unexpectedNullCharacter);
                this.state = SCRIPT_DATA_ESCAPED_STATE;
                this._emitChars(unicode.REPLACEMENT_CHARACTER);
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInScriptHtmlCommentLikeText);
                this._emitEOFToken();
            } else {
                this.state = SCRIPT_DATA_ESCAPED_STATE;
                this._emitCodePoint(cp);
            }
        }

        // Script data escaped dash dash state
        //------------------------------------------------------------------
        [SCRIPT_DATA_ESCAPED_DASH_DASH_STATE](cp) {
            if (cp === $$1.HYPHEN_MINUS) {
                this._emitChars('-');
            } else if (cp === $$1.LESS_THAN_SIGN) {
                this.state = SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN_STATE;
            } else if (cp === $$1.GREATER_THAN_SIGN) {
                this.state = SCRIPT_DATA_STATE;
                this._emitChars('>');
            } else if (cp === $$1.NULL) {
                this._err(errorCodes.unexpectedNullCharacter);
                this.state = SCRIPT_DATA_ESCAPED_STATE;
                this._emitChars(unicode.REPLACEMENT_CHARACTER);
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInScriptHtmlCommentLikeText);
                this._emitEOFToken();
            } else {
                this.state = SCRIPT_DATA_ESCAPED_STATE;
                this._emitCodePoint(cp);
            }
        }

        // Script data escaped less-than sign state
        //------------------------------------------------------------------
        [SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN_STATE](cp) {
            if (cp === $$1.SOLIDUS) {
                this.tempBuff = [];
                this.state = SCRIPT_DATA_ESCAPED_END_TAG_OPEN_STATE;
            } else if (isAsciiLetter(cp)) {
                this.tempBuff = [];
                this._emitChars('<');
                this._reconsumeInState(SCRIPT_DATA_DOUBLE_ESCAPE_START_STATE);
            } else {
                this._emitChars('<');
                this._reconsumeInState(SCRIPT_DATA_ESCAPED_STATE);
            }
        }

        // Script data escaped end tag open state
        //------------------------------------------------------------------
        [SCRIPT_DATA_ESCAPED_END_TAG_OPEN_STATE](cp) {
            if (isAsciiLetter(cp)) {
                this._createEndTagToken();
                this._reconsumeInState(SCRIPT_DATA_ESCAPED_END_TAG_NAME_STATE);
            } else {
                this._emitChars('</');
                this._reconsumeInState(SCRIPT_DATA_ESCAPED_STATE);
            }
        }

        // Script data escaped end tag name state
        //------------------------------------------------------------------
        [SCRIPT_DATA_ESCAPED_END_TAG_NAME_STATE](cp) {
            if (isAsciiUpper(cp)) {
                this.currentToken.tagName += toAsciiLowerChar(cp);
                this.tempBuff.push(cp);
            } else if (isAsciiLower(cp)) {
                this.currentToken.tagName += toChar(cp);
                this.tempBuff.push(cp);
            } else {
                if (this.lastStartTagName === this.currentToken.tagName) {
                    if (isWhitespace(cp)) {
                        this.state = BEFORE_ATTRIBUTE_NAME_STATE;
                        return;
                    }

                    if (cp === $$1.SOLIDUS) {
                        this.state = SELF_CLOSING_START_TAG_STATE;
                        return;
                    }

                    if (cp === $$1.GREATER_THAN_SIGN) {
                        this._emitCurrentToken();
                        this.state = DATA_STATE;
                        return;
                    }
                }

                this._emitChars('</');
                this._emitSeveralCodePoints(this.tempBuff);
                this._reconsumeInState(SCRIPT_DATA_ESCAPED_STATE);
            }
        }

        // Script data double escape start state
        //------------------------------------------------------------------
        [SCRIPT_DATA_DOUBLE_ESCAPE_START_STATE](cp) {
            if (isWhitespace(cp) || cp === $$1.SOLIDUS || cp === $$1.GREATER_THAN_SIGN) {
                this.state = this._isTempBufferEqualToScriptString()
                    ? SCRIPT_DATA_DOUBLE_ESCAPED_STATE
                    : SCRIPT_DATA_ESCAPED_STATE;
                this._emitCodePoint(cp);
            } else if (isAsciiUpper(cp)) {
                this.tempBuff.push(toAsciiLowerCodePoint(cp));
                this._emitCodePoint(cp);
            } else if (isAsciiLower(cp)) {
                this.tempBuff.push(cp);
                this._emitCodePoint(cp);
            } else {
                this._reconsumeInState(SCRIPT_DATA_ESCAPED_STATE);
            }
        }

        // Script data double escaped state
        //------------------------------------------------------------------
        [SCRIPT_DATA_DOUBLE_ESCAPED_STATE](cp) {
            if (cp === $$1.HYPHEN_MINUS) {
                this.state = SCRIPT_DATA_DOUBLE_ESCAPED_DASH_STATE;
                this._emitChars('-');
            } else if (cp === $$1.LESS_THAN_SIGN) {
                this.state = SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN_STATE;
                this._emitChars('<');
            } else if (cp === $$1.NULL) {
                this._err(errorCodes.unexpectedNullCharacter);
                this._emitChars(unicode.REPLACEMENT_CHARACTER);
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInScriptHtmlCommentLikeText);
                this._emitEOFToken();
            } else {
                this._emitCodePoint(cp);
            }
        }

        // Script data double escaped dash state
        //------------------------------------------------------------------
        [SCRIPT_DATA_DOUBLE_ESCAPED_DASH_STATE](cp) {
            if (cp === $$1.HYPHEN_MINUS) {
                this.state = SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH_STATE;
                this._emitChars('-');
            } else if (cp === $$1.LESS_THAN_SIGN) {
                this.state = SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN_STATE;
                this._emitChars('<');
            } else if (cp === $$1.NULL) {
                this._err(errorCodes.unexpectedNullCharacter);
                this.state = SCRIPT_DATA_DOUBLE_ESCAPED_STATE;
                this._emitChars(unicode.REPLACEMENT_CHARACTER);
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInScriptHtmlCommentLikeText);
                this._emitEOFToken();
            } else {
                this.state = SCRIPT_DATA_DOUBLE_ESCAPED_STATE;
                this._emitCodePoint(cp);
            }
        }

        // Script data double escaped dash dash state
        //------------------------------------------------------------------
        [SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH_STATE](cp) {
            if (cp === $$1.HYPHEN_MINUS) {
                this._emitChars('-');
            } else if (cp === $$1.LESS_THAN_SIGN) {
                this.state = SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN_STATE;
                this._emitChars('<');
            } else if (cp === $$1.GREATER_THAN_SIGN) {
                this.state = SCRIPT_DATA_STATE;
                this._emitChars('>');
            } else if (cp === $$1.NULL) {
                this._err(errorCodes.unexpectedNullCharacter);
                this.state = SCRIPT_DATA_DOUBLE_ESCAPED_STATE;
                this._emitChars(unicode.REPLACEMENT_CHARACTER);
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInScriptHtmlCommentLikeText);
                this._emitEOFToken();
            } else {
                this.state = SCRIPT_DATA_DOUBLE_ESCAPED_STATE;
                this._emitCodePoint(cp);
            }
        }

        // Script data double escaped less-than sign state
        //------------------------------------------------------------------
        [SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN_STATE](cp) {
            if (cp === $$1.SOLIDUS) {
                this.tempBuff = [];
                this.state = SCRIPT_DATA_DOUBLE_ESCAPE_END_STATE;
                this._emitChars('/');
            } else {
                this._reconsumeInState(SCRIPT_DATA_DOUBLE_ESCAPED_STATE);
            }
        }

        // Script data double escape end state
        //------------------------------------------------------------------
        [SCRIPT_DATA_DOUBLE_ESCAPE_END_STATE](cp) {
            if (isWhitespace(cp) || cp === $$1.SOLIDUS || cp === $$1.GREATER_THAN_SIGN) {
                this.state = this._isTempBufferEqualToScriptString()
                    ? SCRIPT_DATA_ESCAPED_STATE
                    : SCRIPT_DATA_DOUBLE_ESCAPED_STATE;

                this._emitCodePoint(cp);
            } else if (isAsciiUpper(cp)) {
                this.tempBuff.push(toAsciiLowerCodePoint(cp));
                this._emitCodePoint(cp);
            } else if (isAsciiLower(cp)) {
                this.tempBuff.push(cp);
                this._emitCodePoint(cp);
            } else {
                this._reconsumeInState(SCRIPT_DATA_DOUBLE_ESCAPED_STATE);
            }
        }

        // Before attribute name state
        //------------------------------------------------------------------
        [BEFORE_ATTRIBUTE_NAME_STATE](cp) {
            if (isWhitespace(cp)) {
                return;
            }

            if (cp === $$1.SOLIDUS || cp === $$1.GREATER_THAN_SIGN || cp === $$1.EOF) {
                this._reconsumeInState(AFTER_ATTRIBUTE_NAME_STATE);
            } else if (cp === $$1.EQUALS_SIGN) {
                this._err(errorCodes.unexpectedEqualsSignBeforeAttributeName);
                this._createAttr('=');
                this.state = ATTRIBUTE_NAME_STATE;
            } else {
                this._createAttr('');
                this._reconsumeInState(ATTRIBUTE_NAME_STATE);
            }
        }

        // Attribute name state
        //------------------------------------------------------------------
        [ATTRIBUTE_NAME_STATE](cp) {
            if (isWhitespace(cp) || cp === $$1.SOLIDUS || cp === $$1.GREATER_THAN_SIGN || cp === $$1.EOF) {
                this._leaveAttrName(AFTER_ATTRIBUTE_NAME_STATE);
                this._unconsume();
            } else if (cp === $$1.EQUALS_SIGN) {
                this._leaveAttrName(BEFORE_ATTRIBUTE_VALUE_STATE);
            } else if (isAsciiUpper(cp)) {
                this.currentAttr.name += toAsciiLowerChar(cp);
            } else if (cp === $$1.QUOTATION_MARK || cp === $$1.APOSTROPHE || cp === $$1.LESS_THAN_SIGN) {
                this._err(errorCodes.unexpectedCharacterInAttributeName);
                this.currentAttr.name += toChar(cp);
            } else if (cp === $$1.NULL) {
                this._err(errorCodes.unexpectedNullCharacter);
                this.currentAttr.name += unicode.REPLACEMENT_CHARACTER;
            } else {
                this.currentAttr.name += toChar(cp);
            }
        }

        // After attribute name state
        //------------------------------------------------------------------
        [AFTER_ATTRIBUTE_NAME_STATE](cp) {
            if (isWhitespace(cp)) {
                return;
            }

            if (cp === $$1.SOLIDUS) {
                this.state = SELF_CLOSING_START_TAG_STATE;
            } else if (cp === $$1.EQUALS_SIGN) {
                this.state = BEFORE_ATTRIBUTE_VALUE_STATE;
            } else if (cp === $$1.GREATER_THAN_SIGN) {
                this.state = DATA_STATE;
                this._emitCurrentToken();
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInTag);
                this._emitEOFToken();
            } else {
                this._createAttr('');
                this._reconsumeInState(ATTRIBUTE_NAME_STATE);
            }
        }

        // Before attribute value state
        //------------------------------------------------------------------
        [BEFORE_ATTRIBUTE_VALUE_STATE](cp) {
            if (isWhitespace(cp)) {
                return;
            }

            if (cp === $$1.QUOTATION_MARK) {
                this.state = ATTRIBUTE_VALUE_DOUBLE_QUOTED_STATE;
            } else if (cp === $$1.APOSTROPHE) {
                this.state = ATTRIBUTE_VALUE_SINGLE_QUOTED_STATE;
            } else if (cp === $$1.GREATER_THAN_SIGN) {
                this._err(errorCodes.missingAttributeValue);
                this.state = DATA_STATE;
                this._emitCurrentToken();
            } else {
                this._reconsumeInState(ATTRIBUTE_VALUE_UNQUOTED_STATE);
            }
        }

        // Attribute value (double-quoted) state
        //------------------------------------------------------------------
        [ATTRIBUTE_VALUE_DOUBLE_QUOTED_STATE](cp) {
            if (cp === $$1.QUOTATION_MARK) {
                this.state = AFTER_ATTRIBUTE_VALUE_QUOTED_STATE;
            } else if (cp === $$1.AMPERSAND) {
                this.returnState = ATTRIBUTE_VALUE_DOUBLE_QUOTED_STATE;
                this.state = CHARACTER_REFERENCE_STATE;
            } else if (cp === $$1.NULL) {
                this._err(errorCodes.unexpectedNullCharacter);
                this.currentAttr.value += unicode.REPLACEMENT_CHARACTER;
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInTag);
                this._emitEOFToken();
            } else {
                this.currentAttr.value += toChar(cp);
            }
        }

        // Attribute value (single-quoted) state
        //------------------------------------------------------------------
        [ATTRIBUTE_VALUE_SINGLE_QUOTED_STATE](cp) {
            if (cp === $$1.APOSTROPHE) {
                this.state = AFTER_ATTRIBUTE_VALUE_QUOTED_STATE;
            } else if (cp === $$1.AMPERSAND) {
                this.returnState = ATTRIBUTE_VALUE_SINGLE_QUOTED_STATE;
                this.state = CHARACTER_REFERENCE_STATE;
            } else if (cp === $$1.NULL) {
                this._err(errorCodes.unexpectedNullCharacter);
                this.currentAttr.value += unicode.REPLACEMENT_CHARACTER;
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInTag);
                this._emitEOFToken();
            } else {
                this.currentAttr.value += toChar(cp);
            }
        }

        // Attribute value (unquoted) state
        //------------------------------------------------------------------
        [ATTRIBUTE_VALUE_UNQUOTED_STATE](cp) {
            if (isWhitespace(cp)) {
                this._leaveAttrValue(BEFORE_ATTRIBUTE_NAME_STATE);
            } else if (cp === $$1.AMPERSAND) {
                this.returnState = ATTRIBUTE_VALUE_UNQUOTED_STATE;
                this.state = CHARACTER_REFERENCE_STATE;
            } else if (cp === $$1.GREATER_THAN_SIGN) {
                this._leaveAttrValue(DATA_STATE);
                this._emitCurrentToken();
            } else if (cp === $$1.NULL) {
                this._err(errorCodes.unexpectedNullCharacter);
                this.currentAttr.value += unicode.REPLACEMENT_CHARACTER;
            } else if (
                cp === $$1.QUOTATION_MARK ||
                cp === $$1.APOSTROPHE ||
                cp === $$1.LESS_THAN_SIGN ||
                cp === $$1.EQUALS_SIGN ||
                cp === $$1.GRAVE_ACCENT
            ) {
                this._err(errorCodes.unexpectedCharacterInUnquotedAttributeValue);
                this.currentAttr.value += toChar(cp);
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInTag);
                this._emitEOFToken();
            } else {
                this.currentAttr.value += toChar(cp);
            }
        }

        // After attribute value (quoted) state
        //------------------------------------------------------------------
        [AFTER_ATTRIBUTE_VALUE_QUOTED_STATE](cp) {
            if (isWhitespace(cp)) {
                this._leaveAttrValue(BEFORE_ATTRIBUTE_NAME_STATE);
            } else if (cp === $$1.SOLIDUS) {
                this._leaveAttrValue(SELF_CLOSING_START_TAG_STATE);
            } else if (cp === $$1.GREATER_THAN_SIGN) {
                this._leaveAttrValue(DATA_STATE);
                this._emitCurrentToken();
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInTag);
                this._emitEOFToken();
            } else {
                this._err(errorCodes.missingWhitespaceBetweenAttributes);
                this._reconsumeInState(BEFORE_ATTRIBUTE_NAME_STATE);
            }
        }

        // Self-closing start tag state
        //------------------------------------------------------------------
        [SELF_CLOSING_START_TAG_STATE](cp) {
            if (cp === $$1.GREATER_THAN_SIGN) {
                this.currentToken.selfClosing = true;
                this.state = DATA_STATE;
                this._emitCurrentToken();
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInTag);
                this._emitEOFToken();
            } else {
                this._err(errorCodes.unexpectedSolidusInTag);
                this._reconsumeInState(BEFORE_ATTRIBUTE_NAME_STATE);
            }
        }

        // Bogus comment state
        //------------------------------------------------------------------
        [BOGUS_COMMENT_STATE](cp) {
            if (cp === $$1.GREATER_THAN_SIGN) {
                this.state = DATA_STATE;
                this._emitCurrentToken();
            } else if (cp === $$1.EOF) {
                this._emitCurrentToken();
                this._emitEOFToken();
            } else if (cp === $$1.NULL) {
                this._err(errorCodes.unexpectedNullCharacter);
                this.currentToken.data += unicode.REPLACEMENT_CHARACTER;
            } else {
                this.currentToken.data += toChar(cp);
            }
        }

        // Markup declaration open state
        //------------------------------------------------------------------
        [MARKUP_DECLARATION_OPEN_STATE](cp) {
            if (this._consumeSequenceIfMatch($$.DASH_DASH_STRING, cp, true)) {
                this._createCommentToken();
                this.state = COMMENT_START_STATE;
            } else if (this._consumeSequenceIfMatch($$.DOCTYPE_STRING, cp, false)) {
                this.state = DOCTYPE_STATE;
            } else if (this._consumeSequenceIfMatch($$.CDATA_START_STRING, cp, true)) {
                if (this.allowCDATA) {
                    this.state = CDATA_SECTION_STATE;
                } else {
                    this._err(errorCodes.cdataInHtmlContent);
                    this._createCommentToken();
                    this.currentToken.data = '[CDATA[';
                    this.state = BOGUS_COMMENT_STATE;
                }
            }

            //NOTE: sequence lookup can be abrupted by hibernation. In that case lookup
            //results are no longer valid and we will need to start over.
            else if (!this._ensureHibernation()) {
                this._err(errorCodes.incorrectlyOpenedComment);
                this._createCommentToken();
                this._reconsumeInState(BOGUS_COMMENT_STATE);
            }
        }

        // Comment start state
        //------------------------------------------------------------------
        [COMMENT_START_STATE](cp) {
            if (cp === $$1.HYPHEN_MINUS) {
                this.state = COMMENT_START_DASH_STATE;
            } else if (cp === $$1.GREATER_THAN_SIGN) {
                this._err(errorCodes.abruptClosingOfEmptyComment);
                this.state = DATA_STATE;
                this._emitCurrentToken();
            } else {
                this._reconsumeInState(COMMENT_STATE);
            }
        }

        // Comment start dash state
        //------------------------------------------------------------------
        [COMMENT_START_DASH_STATE](cp) {
            if (cp === $$1.HYPHEN_MINUS) {
                this.state = COMMENT_END_STATE;
            } else if (cp === $$1.GREATER_THAN_SIGN) {
                this._err(errorCodes.abruptClosingOfEmptyComment);
                this.state = DATA_STATE;
                this._emitCurrentToken();
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInComment);
                this._emitCurrentToken();
                this._emitEOFToken();
            } else {
                this.currentToken.data += '-';
                this._reconsumeInState(COMMENT_STATE);
            }
        }

        // Comment state
        //------------------------------------------------------------------
        [COMMENT_STATE](cp) {
            if (cp === $$1.HYPHEN_MINUS) {
                this.state = COMMENT_END_DASH_STATE;
            } else if (cp === $$1.LESS_THAN_SIGN) {
                this.currentToken.data += '<';
                this.state = COMMENT_LESS_THAN_SIGN_STATE;
            } else if (cp === $$1.NULL) {
                this._err(errorCodes.unexpectedNullCharacter);
                this.currentToken.data += unicode.REPLACEMENT_CHARACTER;
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInComment);
                this._emitCurrentToken();
                this._emitEOFToken();
            } else {
                this.currentToken.data += toChar(cp);
            }
        }

        // Comment less-than sign state
        //------------------------------------------------------------------
        [COMMENT_LESS_THAN_SIGN_STATE](cp) {
            if (cp === $$1.EXCLAMATION_MARK) {
                this.currentToken.data += '!';
                this.state = COMMENT_LESS_THAN_SIGN_BANG_STATE;
            } else if (cp === $$1.LESS_THAN_SIGN) {
                this.currentToken.data += '!';
            } else {
                this._reconsumeInState(COMMENT_STATE);
            }
        }

        // Comment less-than sign bang state
        //------------------------------------------------------------------
        [COMMENT_LESS_THAN_SIGN_BANG_STATE](cp) {
            if (cp === $$1.HYPHEN_MINUS) {
                this.state = COMMENT_LESS_THAN_SIGN_BANG_DASH_STATE;
            } else {
                this._reconsumeInState(COMMENT_STATE);
            }
        }

        // Comment less-than sign bang dash state
        //------------------------------------------------------------------
        [COMMENT_LESS_THAN_SIGN_BANG_DASH_STATE](cp) {
            if (cp === $$1.HYPHEN_MINUS) {
                this.state = COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH_STATE;
            } else {
                this._reconsumeInState(COMMENT_END_DASH_STATE);
            }
        }

        // Comment less-than sign bang dash dash state
        //------------------------------------------------------------------
        [COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH_STATE](cp) {
            if (cp !== $$1.GREATER_THAN_SIGN && cp !== $$1.EOF) {
                this._err(errorCodes.nestedComment);
            }

            this._reconsumeInState(COMMENT_END_STATE);
        }

        // Comment end dash state
        //------------------------------------------------------------------
        [COMMENT_END_DASH_STATE](cp) {
            if (cp === $$1.HYPHEN_MINUS) {
                this.state = COMMENT_END_STATE;
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInComment);
                this._emitCurrentToken();
                this._emitEOFToken();
            } else {
                this.currentToken.data += '-';
                this._reconsumeInState(COMMENT_STATE);
            }
        }

        // Comment end state
        //------------------------------------------------------------------
        [COMMENT_END_STATE](cp) {
            if (cp === $$1.GREATER_THAN_SIGN) {
                this.state = DATA_STATE;
                this._emitCurrentToken();
            } else if (cp === $$1.EXCLAMATION_MARK) {
                this.state = COMMENT_END_BANG_STATE;
            } else if (cp === $$1.HYPHEN_MINUS) {
                this.currentToken.data += '-';
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInComment);
                this._emitCurrentToken();
                this._emitEOFToken();
            } else {
                this.currentToken.data += '--';
                this._reconsumeInState(COMMENT_STATE);
            }
        }

        // Comment end bang state
        //------------------------------------------------------------------
        [COMMENT_END_BANG_STATE](cp) {
            if (cp === $$1.HYPHEN_MINUS) {
                this.currentToken.data += '--!';
                this.state = COMMENT_END_DASH_STATE;
            } else if (cp === $$1.GREATER_THAN_SIGN) {
                this._err(errorCodes.incorrectlyClosedComment);
                this.state = DATA_STATE;
                this._emitCurrentToken();
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInComment);
                this._emitCurrentToken();
                this._emitEOFToken();
            } else {
                this.currentToken.data += '--!';
                this._reconsumeInState(COMMENT_STATE);
            }
        }

        // DOCTYPE state
        //------------------------------------------------------------------
        [DOCTYPE_STATE](cp) {
            if (isWhitespace(cp)) {
                this.state = BEFORE_DOCTYPE_NAME_STATE;
            } else if (cp === $$1.GREATER_THAN_SIGN) {
                this._reconsumeInState(BEFORE_DOCTYPE_NAME_STATE);
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInDoctype);
                this._createDoctypeToken(null);
                this.currentToken.forceQuirks = true;
                this._emitCurrentToken();
                this._emitEOFToken();
            } else {
                this._err(errorCodes.missingWhitespaceBeforeDoctypeName);
                this._reconsumeInState(BEFORE_DOCTYPE_NAME_STATE);
            }
        }

        // Before DOCTYPE name state
        //------------------------------------------------------------------
        [BEFORE_DOCTYPE_NAME_STATE](cp) {
            if (isWhitespace(cp)) {
                return;
            }

            if (isAsciiUpper(cp)) {
                this._createDoctypeToken(toAsciiLowerChar(cp));
                this.state = DOCTYPE_NAME_STATE;
            } else if (cp === $$1.NULL) {
                this._err(errorCodes.unexpectedNullCharacter);
                this._createDoctypeToken(unicode.REPLACEMENT_CHARACTER);
                this.state = DOCTYPE_NAME_STATE;
            } else if (cp === $$1.GREATER_THAN_SIGN) {
                this._err(errorCodes.missingDoctypeName);
                this._createDoctypeToken(null);
                this.currentToken.forceQuirks = true;
                this._emitCurrentToken();
                this.state = DATA_STATE;
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInDoctype);
                this._createDoctypeToken(null);
                this.currentToken.forceQuirks = true;
                this._emitCurrentToken();
                this._emitEOFToken();
            } else {
                this._createDoctypeToken(toChar(cp));
                this.state = DOCTYPE_NAME_STATE;
            }
        }

        // DOCTYPE name state
        //------------------------------------------------------------------
        [DOCTYPE_NAME_STATE](cp) {
            if (isWhitespace(cp)) {
                this.state = AFTER_DOCTYPE_NAME_STATE;
            } else if (cp === $$1.GREATER_THAN_SIGN) {
                this.state = DATA_STATE;
                this._emitCurrentToken();
            } else if (isAsciiUpper(cp)) {
                this.currentToken.name += toAsciiLowerChar(cp);
            } else if (cp === $$1.NULL) {
                this._err(errorCodes.unexpectedNullCharacter);
                this.currentToken.name += unicode.REPLACEMENT_CHARACTER;
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInDoctype);
                this.currentToken.forceQuirks = true;
                this._emitCurrentToken();
                this._emitEOFToken();
            } else {
                this.currentToken.name += toChar(cp);
            }
        }

        // After DOCTYPE name state
        //------------------------------------------------------------------
        [AFTER_DOCTYPE_NAME_STATE](cp) {
            if (isWhitespace(cp)) {
                return;
            }

            if (cp === $$1.GREATER_THAN_SIGN) {
                this.state = DATA_STATE;
                this._emitCurrentToken();
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInDoctype);
                this.currentToken.forceQuirks = true;
                this._emitCurrentToken();
                this._emitEOFToken();
            } else if (this._consumeSequenceIfMatch($$.PUBLIC_STRING, cp, false)) {
                this.state = AFTER_DOCTYPE_PUBLIC_KEYWORD_STATE;
            } else if (this._consumeSequenceIfMatch($$.SYSTEM_STRING, cp, false)) {
                this.state = AFTER_DOCTYPE_SYSTEM_KEYWORD_STATE;
            }
            //NOTE: sequence lookup can be abrupted by hibernation. In that case lookup
            //results are no longer valid and we will need to start over.
            else if (!this._ensureHibernation()) {
                this._err(errorCodes.invalidCharacterSequenceAfterDoctypeName);
                this.currentToken.forceQuirks = true;
                this._reconsumeInState(BOGUS_DOCTYPE_STATE);
            }
        }

        // After DOCTYPE public keyword state
        //------------------------------------------------------------------
        [AFTER_DOCTYPE_PUBLIC_KEYWORD_STATE](cp) {
            if (isWhitespace(cp)) {
                this.state = BEFORE_DOCTYPE_PUBLIC_IDENTIFIER_STATE;
            } else if (cp === $$1.QUOTATION_MARK) {
                this._err(errorCodes.missingWhitespaceAfterDoctypePublicKeyword);
                this.currentToken.publicId = '';
                this.state = DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED_STATE;
            } else if (cp === $$1.APOSTROPHE) {
                this._err(errorCodes.missingWhitespaceAfterDoctypePublicKeyword);
                this.currentToken.publicId = '';
                this.state = DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED_STATE;
            } else if (cp === $$1.GREATER_THAN_SIGN) {
                this._err(errorCodes.missingDoctypePublicIdentifier);
                this.currentToken.forceQuirks = true;
                this.state = DATA_STATE;
                this._emitCurrentToken();
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInDoctype);
                this.currentToken.forceQuirks = true;
                this._emitCurrentToken();
                this._emitEOFToken();
            } else {
                this._err(errorCodes.missingQuoteBeforeDoctypePublicIdentifier);
                this.currentToken.forceQuirks = true;
                this._reconsumeInState(BOGUS_DOCTYPE_STATE);
            }
        }

        // Before DOCTYPE public identifier state
        //------------------------------------------------------------------
        [BEFORE_DOCTYPE_PUBLIC_IDENTIFIER_STATE](cp) {
            if (isWhitespace(cp)) {
                return;
            }

            if (cp === $$1.QUOTATION_MARK) {
                this.currentToken.publicId = '';
                this.state = DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED_STATE;
            } else if (cp === $$1.APOSTROPHE) {
                this.currentToken.publicId = '';
                this.state = DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED_STATE;
            } else if (cp === $$1.GREATER_THAN_SIGN) {
                this._err(errorCodes.missingDoctypePublicIdentifier);
                this.currentToken.forceQuirks = true;
                this.state = DATA_STATE;
                this._emitCurrentToken();
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInDoctype);
                this.currentToken.forceQuirks = true;
                this._emitCurrentToken();
                this._emitEOFToken();
            } else {
                this._err(errorCodes.missingQuoteBeforeDoctypePublicIdentifier);
                this.currentToken.forceQuirks = true;
                this._reconsumeInState(BOGUS_DOCTYPE_STATE);
            }
        }

        // DOCTYPE public identifier (double-quoted) state
        //------------------------------------------------------------------
        [DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED_STATE](cp) {
            if (cp === $$1.QUOTATION_MARK) {
                this.state = AFTER_DOCTYPE_PUBLIC_IDENTIFIER_STATE;
            } else if (cp === $$1.NULL) {
                this._err(errorCodes.unexpectedNullCharacter);
                this.currentToken.publicId += unicode.REPLACEMENT_CHARACTER;
            } else if (cp === $$1.GREATER_THAN_SIGN) {
                this._err(errorCodes.abruptDoctypePublicIdentifier);
                this.currentToken.forceQuirks = true;
                this._emitCurrentToken();
                this.state = DATA_STATE;
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInDoctype);
                this.currentToken.forceQuirks = true;
                this._emitCurrentToken();
                this._emitEOFToken();
            } else {
                this.currentToken.publicId += toChar(cp);
            }
        }

        // DOCTYPE public identifier (single-quoted) state
        //------------------------------------------------------------------
        [DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED_STATE](cp) {
            if (cp === $$1.APOSTROPHE) {
                this.state = AFTER_DOCTYPE_PUBLIC_IDENTIFIER_STATE;
            } else if (cp === $$1.NULL) {
                this._err(errorCodes.unexpectedNullCharacter);
                this.currentToken.publicId += unicode.REPLACEMENT_CHARACTER;
            } else if (cp === $$1.GREATER_THAN_SIGN) {
                this._err(errorCodes.abruptDoctypePublicIdentifier);
                this.currentToken.forceQuirks = true;
                this._emitCurrentToken();
                this.state = DATA_STATE;
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInDoctype);
                this.currentToken.forceQuirks = true;
                this._emitCurrentToken();
                this._emitEOFToken();
            } else {
                this.currentToken.publicId += toChar(cp);
            }
        }

        // After DOCTYPE public identifier state
        //------------------------------------------------------------------
        [AFTER_DOCTYPE_PUBLIC_IDENTIFIER_STATE](cp) {
            if (isWhitespace(cp)) {
                this.state = BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS_STATE;
            } else if (cp === $$1.GREATER_THAN_SIGN) {
                this.state = DATA_STATE;
                this._emitCurrentToken();
            } else if (cp === $$1.QUOTATION_MARK) {
                this._err(errorCodes.missingWhitespaceBetweenDoctypePublicAndSystemIdentifiers);
                this.currentToken.systemId = '';
                this.state = DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED_STATE;
            } else if (cp === $$1.APOSTROPHE) {
                this._err(errorCodes.missingWhitespaceBetweenDoctypePublicAndSystemIdentifiers);
                this.currentToken.systemId = '';
                this.state = DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED_STATE;
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInDoctype);
                this.currentToken.forceQuirks = true;
                this._emitCurrentToken();
                this._emitEOFToken();
            } else {
                this._err(errorCodes.missingQuoteBeforeDoctypeSystemIdentifier);
                this.currentToken.forceQuirks = true;
                this._reconsumeInState(BOGUS_DOCTYPE_STATE);
            }
        }

        // Between DOCTYPE public and system identifiers state
        //------------------------------------------------------------------
        [BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS_STATE](cp) {
            if (isWhitespace(cp)) {
                return;
            }

            if (cp === $$1.GREATER_THAN_SIGN) {
                this._emitCurrentToken();
                this.state = DATA_STATE;
            } else if (cp === $$1.QUOTATION_MARK) {
                this.currentToken.systemId = '';
                this.state = DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED_STATE;
            } else if (cp === $$1.APOSTROPHE) {
                this.currentToken.systemId = '';
                this.state = DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED_STATE;
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInDoctype);
                this.currentToken.forceQuirks = true;
                this._emitCurrentToken();
                this._emitEOFToken();
            } else {
                this._err(errorCodes.missingQuoteBeforeDoctypeSystemIdentifier);
                this.currentToken.forceQuirks = true;
                this._reconsumeInState(BOGUS_DOCTYPE_STATE);
            }
        }

        // After DOCTYPE system keyword state
        //------------------------------------------------------------------
        [AFTER_DOCTYPE_SYSTEM_KEYWORD_STATE](cp) {
            if (isWhitespace(cp)) {
                this.state = BEFORE_DOCTYPE_SYSTEM_IDENTIFIER_STATE;
            } else if (cp === $$1.QUOTATION_MARK) {
                this._err(errorCodes.missingWhitespaceAfterDoctypeSystemKeyword);
                this.currentToken.systemId = '';
                this.state = DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED_STATE;
            } else if (cp === $$1.APOSTROPHE) {
                this._err(errorCodes.missingWhitespaceAfterDoctypeSystemKeyword);
                this.currentToken.systemId = '';
                this.state = DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED_STATE;
            } else if (cp === $$1.GREATER_THAN_SIGN) {
                this._err(errorCodes.missingDoctypeSystemIdentifier);
                this.currentToken.forceQuirks = true;
                this.state = DATA_STATE;
                this._emitCurrentToken();
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInDoctype);
                this.currentToken.forceQuirks = true;
                this._emitCurrentToken();
                this._emitEOFToken();
            } else {
                this._err(errorCodes.missingQuoteBeforeDoctypeSystemIdentifier);
                this.currentToken.forceQuirks = true;
                this._reconsumeInState(BOGUS_DOCTYPE_STATE);
            }
        }

        // Before DOCTYPE system identifier state
        //------------------------------------------------------------------
        [BEFORE_DOCTYPE_SYSTEM_IDENTIFIER_STATE](cp) {
            if (isWhitespace(cp)) {
                return;
            }

            if (cp === $$1.QUOTATION_MARK) {
                this.currentToken.systemId = '';
                this.state = DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED_STATE;
            } else if (cp === $$1.APOSTROPHE) {
                this.currentToken.systemId = '';
                this.state = DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED_STATE;
            } else if (cp === $$1.GREATER_THAN_SIGN) {
                this._err(errorCodes.missingDoctypeSystemIdentifier);
                this.currentToken.forceQuirks = true;
                this.state = DATA_STATE;
                this._emitCurrentToken();
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInDoctype);
                this.currentToken.forceQuirks = true;
                this._emitCurrentToken();
                this._emitEOFToken();
            } else {
                this._err(errorCodes.missingQuoteBeforeDoctypeSystemIdentifier);
                this.currentToken.forceQuirks = true;
                this._reconsumeInState(BOGUS_DOCTYPE_STATE);
            }
        }

        // DOCTYPE system identifier (double-quoted) state
        //------------------------------------------------------------------
        [DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED_STATE](cp) {
            if (cp === $$1.QUOTATION_MARK) {
                this.state = AFTER_DOCTYPE_SYSTEM_IDENTIFIER_STATE;
            } else if (cp === $$1.NULL) {
                this._err(errorCodes.unexpectedNullCharacter);
                this.currentToken.systemId += unicode.REPLACEMENT_CHARACTER;
            } else if (cp === $$1.GREATER_THAN_SIGN) {
                this._err(errorCodes.abruptDoctypeSystemIdentifier);
                this.currentToken.forceQuirks = true;
                this._emitCurrentToken();
                this.state = DATA_STATE;
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInDoctype);
                this.currentToken.forceQuirks = true;
                this._emitCurrentToken();
                this._emitEOFToken();
            } else {
                this.currentToken.systemId += toChar(cp);
            }
        }

        // DOCTYPE system identifier (single-quoted) state
        //------------------------------------------------------------------
        [DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED_STATE](cp) {
            if (cp === $$1.APOSTROPHE) {
                this.state = AFTER_DOCTYPE_SYSTEM_IDENTIFIER_STATE;
            } else if (cp === $$1.NULL) {
                this._err(errorCodes.unexpectedNullCharacter);
                this.currentToken.systemId += unicode.REPLACEMENT_CHARACTER;
            } else if (cp === $$1.GREATER_THAN_SIGN) {
                this._err(errorCodes.abruptDoctypeSystemIdentifier);
                this.currentToken.forceQuirks = true;
                this._emitCurrentToken();
                this.state = DATA_STATE;
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInDoctype);
                this.currentToken.forceQuirks = true;
                this._emitCurrentToken();
                this._emitEOFToken();
            } else {
                this.currentToken.systemId += toChar(cp);
            }
        }

        // After DOCTYPE system identifier state
        //------------------------------------------------------------------
        [AFTER_DOCTYPE_SYSTEM_IDENTIFIER_STATE](cp) {
            if (isWhitespace(cp)) {
                return;
            }

            if (cp === $$1.GREATER_THAN_SIGN) {
                this._emitCurrentToken();
                this.state = DATA_STATE;
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInDoctype);
                this.currentToken.forceQuirks = true;
                this._emitCurrentToken();
                this._emitEOFToken();
            } else {
                this._err(errorCodes.unexpectedCharacterAfterDoctypeSystemIdentifier);
                this._reconsumeInState(BOGUS_DOCTYPE_STATE);
            }
        }

        // Bogus DOCTYPE state
        //------------------------------------------------------------------
        [BOGUS_DOCTYPE_STATE](cp) {
            if (cp === $$1.GREATER_THAN_SIGN) {
                this._emitCurrentToken();
                this.state = DATA_STATE;
            } else if (cp === $$1.NULL) {
                this._err(errorCodes.unexpectedNullCharacter);
            } else if (cp === $$1.EOF) {
                this._emitCurrentToken();
                this._emitEOFToken();
            }
        }

        // CDATA section state
        //------------------------------------------------------------------
        [CDATA_SECTION_STATE](cp) {
            if (cp === $$1.RIGHT_SQUARE_BRACKET) {
                this.state = CDATA_SECTION_BRACKET_STATE;
            } else if (cp === $$1.EOF) {
                this._err(errorCodes.eofInCdata);
                this._emitEOFToken();
            } else {
                this._emitCodePoint(cp);
            }
        }

        // CDATA section bracket state
        //------------------------------------------------------------------
        [CDATA_SECTION_BRACKET_STATE](cp) {
            if (cp === $$1.RIGHT_SQUARE_BRACKET) {
                this.state = CDATA_SECTION_END_STATE;
            } else {
                this._emitChars(']');
                this._reconsumeInState(CDATA_SECTION_STATE);
            }
        }

        // CDATA section end state
        //------------------------------------------------------------------
        [CDATA_SECTION_END_STATE](cp) {
            if (cp === $$1.GREATER_THAN_SIGN) {
                this.state = DATA_STATE;
            } else if (cp === $$1.RIGHT_SQUARE_BRACKET) {
                this._emitChars(']');
            } else {
                this._emitChars(']]');
                this._reconsumeInState(CDATA_SECTION_STATE);
            }
        }

        // Character reference state
        //------------------------------------------------------------------
        [CHARACTER_REFERENCE_STATE](cp) {
            this.tempBuff = [$$1.AMPERSAND];

            if (cp === $$1.NUMBER_SIGN) {
                this.tempBuff.push(cp);
                this.state = NUMERIC_CHARACTER_REFERENCE_STATE;
            } else if (isAsciiAlphaNumeric(cp)) {
                this._reconsumeInState(NAMED_CHARACTER_REFERENCE_STATE);
            } else {
                this._flushCodePointsConsumedAsCharacterReference();
                this._reconsumeInState(this.returnState);
            }
        }

        // Named character reference state
        //------------------------------------------------------------------
        [NAMED_CHARACTER_REFERENCE_STATE](cp) {
            const matchResult = this._matchNamedCharacterReference(cp);

            //NOTE: matching can be abrupted by hibernation. In that case match
            //results are no longer valid and we will need to start over.
            if (this._ensureHibernation()) {
                this.tempBuff = [$$1.AMPERSAND];
            } else if (matchResult) {
                const withSemicolon = this.tempBuff[this.tempBuff.length - 1] === $$1.SEMICOLON;

                if (!this._isCharacterReferenceAttributeQuirk(withSemicolon)) {
                    if (!withSemicolon) {
                        this._errOnNextCodePoint(errorCodes.missingSemicolonAfterCharacterReference);
                    }

                    this.tempBuff = matchResult;
                }

                this._flushCodePointsConsumedAsCharacterReference();
                this.state = this.returnState;
            } else {
                this._flushCodePointsConsumedAsCharacterReference();
                this.state = AMBIGUOUS_AMPERSAND_STATE;
            }
        }

        // Ambiguos ampersand state
        //------------------------------------------------------------------
        [AMBIGUOUS_AMPERSAND_STATE](cp) {
            if (isAsciiAlphaNumeric(cp)) {
                if (this._isCharacterReferenceInAttribute()) {
                    this.currentAttr.value += toChar(cp);
                } else {
                    this._emitCodePoint(cp);
                }
            } else {
                if (cp === $$1.SEMICOLON) {
                    this._err(errorCodes.unknownNamedCharacterReference);
                }

                this._reconsumeInState(this.returnState);
            }
        }

        // Numeric character reference state
        //------------------------------------------------------------------
        [NUMERIC_CHARACTER_REFERENCE_STATE](cp) {
            this.charRefCode = 0;

            if (cp === $$1.LATIN_SMALL_X || cp === $$1.LATIN_CAPITAL_X) {
                this.tempBuff.push(cp);
                this.state = HEXADEMICAL_CHARACTER_REFERENCE_START_STATE;
            } else {
                this._reconsumeInState(DECIMAL_CHARACTER_REFERENCE_START_STATE);
            }
        }

        // Hexademical character reference start state
        //------------------------------------------------------------------
        [HEXADEMICAL_CHARACTER_REFERENCE_START_STATE](cp) {
            if (isAsciiHexDigit(cp)) {
                this._reconsumeInState(HEXADEMICAL_CHARACTER_REFERENCE_STATE);
            } else {
                this._err(errorCodes.absenceOfDigitsInNumericCharacterReference);
                this._flushCodePointsConsumedAsCharacterReference();
                this._reconsumeInState(this.returnState);
            }
        }

        // Decimal character reference start state
        //------------------------------------------------------------------
        [DECIMAL_CHARACTER_REFERENCE_START_STATE](cp) {
            if (isAsciiDigit(cp)) {
                this._reconsumeInState(DECIMAL_CHARACTER_REFERENCE_STATE);
            } else {
                this._err(errorCodes.absenceOfDigitsInNumericCharacterReference);
                this._flushCodePointsConsumedAsCharacterReference();
                this._reconsumeInState(this.returnState);
            }
        }

        // Hexademical character reference state
        //------------------------------------------------------------------
        [HEXADEMICAL_CHARACTER_REFERENCE_STATE](cp) {
            if (isAsciiUpperHexDigit(cp)) {
                this.charRefCode = this.charRefCode * 16 + cp - 0x37;
            } else if (isAsciiLowerHexDigit(cp)) {
                this.charRefCode = this.charRefCode * 16 + cp - 0x57;
            } else if (isAsciiDigit(cp)) {
                this.charRefCode = this.charRefCode * 16 + cp - 0x30;
            } else if (cp === $$1.SEMICOLON) {
                this.state = NUMERIC_CHARACTER_REFERENCE_END_STATE;
            } else {
                this._err(errorCodes.missingSemicolonAfterCharacterReference);
                this._reconsumeInState(NUMERIC_CHARACTER_REFERENCE_END_STATE);
            }
        }

        // Decimal character reference state
        //------------------------------------------------------------------
        [DECIMAL_CHARACTER_REFERENCE_STATE](cp) {
            if (isAsciiDigit(cp)) {
                this.charRefCode = this.charRefCode * 10 + cp - 0x30;
            } else if (cp === $$1.SEMICOLON) {
                this.state = NUMERIC_CHARACTER_REFERENCE_END_STATE;
            } else {
                this._err(errorCodes.missingSemicolonAfterCharacterReference);
                this._reconsumeInState(NUMERIC_CHARACTER_REFERENCE_END_STATE);
            }
        }

        // Numeric character reference end state
        //------------------------------------------------------------------
        [NUMERIC_CHARACTER_REFERENCE_END_STATE]() {
            if (this.charRefCode === $$1.NULL) {
                this._err(errorCodes.nullCharacterReference);
                this.charRefCode = $$1.REPLACEMENT_CHARACTER;
            } else if (this.charRefCode > 0x10ffff) {
                this._err(errorCodes.characterReferenceOutsideUnicodeRange);
                this.charRefCode = $$1.REPLACEMENT_CHARACTER;
            } else if (unicode.isSurrogate(this.charRefCode)) {
                this._err(errorCodes.surrogateCharacterReference);
                this.charRefCode = $$1.REPLACEMENT_CHARACTER;
            } else if (unicode.isUndefinedCodePoint(this.charRefCode)) {
                this._err(errorCodes.noncharacterCharacterReference);
            } else if (unicode.isControlCodePoint(this.charRefCode) || this.charRefCode === $$1.CARRIAGE_RETURN) {
                this._err(errorCodes.controlCharacterReference);

                const replacement = C1_CONTROLS_REFERENCE_REPLACEMENTS[this.charRefCode];

                if (replacement) {
                    this.charRefCode = replacement;
                }
            }

            this.tempBuff = [this.charRefCode];

            this._flushCodePointsConsumedAsCharacterReference();
            this._reconsumeInState(this.returnState);
        }
    }

    //Token types
    Tokenizer.CHARACTER_TOKEN = 'CHARACTER_TOKEN';
    Tokenizer.NULL_CHARACTER_TOKEN = 'NULL_CHARACTER_TOKEN';
    Tokenizer.WHITESPACE_CHARACTER_TOKEN = 'WHITESPACE_CHARACTER_TOKEN';
    Tokenizer.START_TAG_TOKEN = 'START_TAG_TOKEN';
    Tokenizer.END_TAG_TOKEN = 'END_TAG_TOKEN';
    Tokenizer.COMMENT_TOKEN = 'COMMENT_TOKEN';
    Tokenizer.DOCTYPE_TOKEN = 'DOCTYPE_TOKEN';
    Tokenizer.EOF_TOKEN = 'EOF_TOKEN';
    Tokenizer.HIBERNATION_TOKEN = 'HIBERNATION_TOKEN';

    //Tokenizer initial states for different modes
    Tokenizer.MODE = {
        DATA: DATA_STATE,
        RCDATA: RCDATA_STATE,
        RAWTEXT: RAWTEXT_STATE,
        SCRIPT_DATA: SCRIPT_DATA_STATE,
        PLAINTEXT: PLAINTEXT_STATE
    };

    //Static
    Tokenizer.getTokenAttr = function(token, attrName) {
        for (let i = token.attrs.length - 1; i >= 0; i--) {
            if (token.attrs[i].name === attrName) {
                return token.attrs[i].value;
            }
        }

        return null;
    };

    var tokenizer = Tokenizer;

    var html$1 = createCommonjsModule(function (module, exports) {

    const NS = (exports.NAMESPACES = {
        HTML: 'http://www.w3.org/1999/xhtml',
        MATHML: 'http://www.w3.org/1998/Math/MathML',
        SVG: 'http://www.w3.org/2000/svg',
        XLINK: 'http://www.w3.org/1999/xlink',
        XML: 'http://www.w3.org/XML/1998/namespace',
        XMLNS: 'http://www.w3.org/2000/xmlns/'
    });

    exports.ATTRS = {
        TYPE: 'type',
        ACTION: 'action',
        ENCODING: 'encoding',
        PROMPT: 'prompt',
        NAME: 'name',
        COLOR: 'color',
        FACE: 'face',
        SIZE: 'size'
    };

    exports.DOCUMENT_MODE = {
        NO_QUIRKS: 'no-quirks',
        QUIRKS: 'quirks',
        LIMITED_QUIRKS: 'limited-quirks'
    };

    const $ = (exports.TAG_NAMES = {
        A: 'a',
        ADDRESS: 'address',
        ANNOTATION_XML: 'annotation-xml',
        APPLET: 'applet',
        AREA: 'area',
        ARTICLE: 'article',
        ASIDE: 'aside',

        B: 'b',
        BASE: 'base',
        BASEFONT: 'basefont',
        BGSOUND: 'bgsound',
        BIG: 'big',
        BLOCKQUOTE: 'blockquote',
        BODY: 'body',
        BR: 'br',
        BUTTON: 'button',

        CAPTION: 'caption',
        CENTER: 'center',
        CODE: 'code',
        COL: 'col',
        COLGROUP: 'colgroup',

        DD: 'dd',
        DESC: 'desc',
        DETAILS: 'details',
        DIALOG: 'dialog',
        DIR: 'dir',
        DIV: 'div',
        DL: 'dl',
        DT: 'dt',

        EM: 'em',
        EMBED: 'embed',

        FIELDSET: 'fieldset',
        FIGCAPTION: 'figcaption',
        FIGURE: 'figure',
        FONT: 'font',
        FOOTER: 'footer',
        FOREIGN_OBJECT: 'foreignObject',
        FORM: 'form',
        FRAME: 'frame',
        FRAMESET: 'frameset',

        H1: 'h1',
        H2: 'h2',
        H3: 'h3',
        H4: 'h4',
        H5: 'h5',
        H6: 'h6',
        HEAD: 'head',
        HEADER: 'header',
        HGROUP: 'hgroup',
        HR: 'hr',
        HTML: 'html',

        I: 'i',
        IMG: 'img',
        IMAGE: 'image',
        INPUT: 'input',
        IFRAME: 'iframe',

        KEYGEN: 'keygen',

        LABEL: 'label',
        LI: 'li',
        LINK: 'link',
        LISTING: 'listing',

        MAIN: 'main',
        MALIGNMARK: 'malignmark',
        MARQUEE: 'marquee',
        MATH: 'math',
        MENU: 'menu',
        META: 'meta',
        MGLYPH: 'mglyph',
        MI: 'mi',
        MO: 'mo',
        MN: 'mn',
        MS: 'ms',
        MTEXT: 'mtext',

        NAV: 'nav',
        NOBR: 'nobr',
        NOFRAMES: 'noframes',
        NOEMBED: 'noembed',
        NOSCRIPT: 'noscript',

        OBJECT: 'object',
        OL: 'ol',
        OPTGROUP: 'optgroup',
        OPTION: 'option',

        P: 'p',
        PARAM: 'param',
        PLAINTEXT: 'plaintext',
        PRE: 'pre',

        RB: 'rb',
        RP: 'rp',
        RT: 'rt',
        RTC: 'rtc',
        RUBY: 'ruby',

        S: 's',
        SCRIPT: 'script',
        SECTION: 'section',
        SELECT: 'select',
        SOURCE: 'source',
        SMALL: 'small',
        SPAN: 'span',
        STRIKE: 'strike',
        STRONG: 'strong',
        STYLE: 'style',
        SUB: 'sub',
        SUMMARY: 'summary',
        SUP: 'sup',

        TABLE: 'table',
        TBODY: 'tbody',
        TEMPLATE: 'template',
        TEXTAREA: 'textarea',
        TFOOT: 'tfoot',
        TD: 'td',
        TH: 'th',
        THEAD: 'thead',
        TITLE: 'title',
        TR: 'tr',
        TRACK: 'track',
        TT: 'tt',

        U: 'u',
        UL: 'ul',

        SVG: 'svg',

        VAR: 'var',

        WBR: 'wbr',

        XMP: 'xmp'
    });

    exports.SPECIAL_ELEMENTS = {
        [NS.HTML]: {
            [$.ADDRESS]: true,
            [$.APPLET]: true,
            [$.AREA]: true,
            [$.ARTICLE]: true,
            [$.ASIDE]: true,
            [$.BASE]: true,
            [$.BASEFONT]: true,
            [$.BGSOUND]: true,
            [$.BLOCKQUOTE]: true,
            [$.BODY]: true,
            [$.BR]: true,
            [$.BUTTON]: true,
            [$.CAPTION]: true,
            [$.CENTER]: true,
            [$.COL]: true,
            [$.COLGROUP]: true,
            [$.DD]: true,
            [$.DETAILS]: true,
            [$.DIR]: true,
            [$.DIV]: true,
            [$.DL]: true,
            [$.DT]: true,
            [$.EMBED]: true,
            [$.FIELDSET]: true,
            [$.FIGCAPTION]: true,
            [$.FIGURE]: true,
            [$.FOOTER]: true,
            [$.FORM]: true,
            [$.FRAME]: true,
            [$.FRAMESET]: true,
            [$.H1]: true,
            [$.H2]: true,
            [$.H3]: true,
            [$.H4]: true,
            [$.H5]: true,
            [$.H6]: true,
            [$.HEAD]: true,
            [$.HEADER]: true,
            [$.HGROUP]: true,
            [$.HR]: true,
            [$.HTML]: true,
            [$.IFRAME]: true,
            [$.IMG]: true,
            [$.INPUT]: true,
            [$.LI]: true,
            [$.LINK]: true,
            [$.LISTING]: true,
            [$.MAIN]: true,
            [$.MARQUEE]: true,
            [$.MENU]: true,
            [$.META]: true,
            [$.NAV]: true,
            [$.NOEMBED]: true,
            [$.NOFRAMES]: true,
            [$.NOSCRIPT]: true,
            [$.OBJECT]: true,
            [$.OL]: true,
            [$.P]: true,
            [$.PARAM]: true,
            [$.PLAINTEXT]: true,
            [$.PRE]: true,
            [$.SCRIPT]: true,
            [$.SECTION]: true,
            [$.SELECT]: true,
            [$.SOURCE]: true,
            [$.STYLE]: true,
            [$.SUMMARY]: true,
            [$.TABLE]: true,
            [$.TBODY]: true,
            [$.TD]: true,
            [$.TEMPLATE]: true,
            [$.TEXTAREA]: true,
            [$.TFOOT]: true,
            [$.TH]: true,
            [$.THEAD]: true,
            [$.TITLE]: true,
            [$.TR]: true,
            [$.TRACK]: true,
            [$.UL]: true,
            [$.WBR]: true,
            [$.XMP]: true
        },
        [NS.MATHML]: {
            [$.MI]: true,
            [$.MO]: true,
            [$.MN]: true,
            [$.MS]: true,
            [$.MTEXT]: true,
            [$.ANNOTATION_XML]: true
        },
        [NS.SVG]: {
            [$.TITLE]: true,
            [$.FOREIGN_OBJECT]: true,
            [$.DESC]: true
        }
    };
    });

    //Aliases
    const $$2 = html$1.TAG_NAMES;
    const NS = html$1.NAMESPACES;

    //Element utils

    //OPTIMIZATION: Integer comparisons are low-cost, so we can use very fast tag name length filters here.
    //It's faster than using dictionary.
    function isImpliedEndTagRequired(tn) {
        switch (tn.length) {
            case 1:
                return tn === $$2.P;

            case 2:
                return tn === $$2.RB || tn === $$2.RP || tn === $$2.RT || tn === $$2.DD || tn === $$2.DT || tn === $$2.LI;

            case 3:
                return tn === $$2.RTC;

            case 6:
                return tn === $$2.OPTION;

            case 8:
                return tn === $$2.OPTGROUP;
        }

        return false;
    }

    function isImpliedEndTagRequiredThoroughly(tn) {
        switch (tn.length) {
            case 1:
                return tn === $$2.P;

            case 2:
                return (
                    tn === $$2.RB ||
                    tn === $$2.RP ||
                    tn === $$2.RT ||
                    tn === $$2.DD ||
                    tn === $$2.DT ||
                    tn === $$2.LI ||
                    tn === $$2.TD ||
                    tn === $$2.TH ||
                    tn === $$2.TR
                );

            case 3:
                return tn === $$2.RTC;

            case 5:
                return tn === $$2.TBODY || tn === $$2.TFOOT || tn === $$2.THEAD;

            case 6:
                return tn === $$2.OPTION;

            case 7:
                return tn === $$2.CAPTION;

            case 8:
                return tn === $$2.OPTGROUP || tn === $$2.COLGROUP;
        }

        return false;
    }

    function isScopingElement(tn, ns) {
        switch (tn.length) {
            case 2:
                if (tn === $$2.TD || tn === $$2.TH) {
                    return ns === NS.HTML;
                } else if (tn === $$2.MI || tn === $$2.MO || tn === $$2.MN || tn === $$2.MS) {
                    return ns === NS.MATHML;
                }

                break;

            case 4:
                if (tn === $$2.HTML) {
                    return ns === NS.HTML;
                } else if (tn === $$2.DESC) {
                    return ns === NS.SVG;
                }

                break;

            case 5:
                if (tn === $$2.TABLE) {
                    return ns === NS.HTML;
                } else if (tn === $$2.MTEXT) {
                    return ns === NS.MATHML;
                } else if (tn === $$2.TITLE) {
                    return ns === NS.SVG;
                }

                break;

            case 6:
                return (tn === $$2.APPLET || tn === $$2.OBJECT) && ns === NS.HTML;

            case 7:
                return (tn === $$2.CAPTION || tn === $$2.MARQUEE) && ns === NS.HTML;

            case 8:
                return tn === $$2.TEMPLATE && ns === NS.HTML;

            case 13:
                return tn === $$2.FOREIGN_OBJECT && ns === NS.SVG;

            case 14:
                return tn === $$2.ANNOTATION_XML && ns === NS.MATHML;
        }

        return false;
    }

    //Stack of open elements
    class OpenElementStack {
        constructor(document, treeAdapter) {
            this.stackTop = -1;
            this.items = [];
            this.current = document;
            this.currentTagName = null;
            this.currentTmplContent = null;
            this.tmplCount = 0;
            this.treeAdapter = treeAdapter;
        }

        //Index of element
        _indexOf(element) {
            let idx = -1;

            for (let i = this.stackTop; i >= 0; i--) {
                if (this.items[i] === element) {
                    idx = i;
                    break;
                }
            }
            return idx;
        }

        //Update current element
        _isInTemplate() {
            return this.currentTagName === $$2.TEMPLATE && this.treeAdapter.getNamespaceURI(this.current) === NS.HTML;
        }

        _updateCurrentElement() {
            this.current = this.items[this.stackTop];
            this.currentTagName = this.current && this.treeAdapter.getTagName(this.current);

            this.currentTmplContent = this._isInTemplate() ? this.treeAdapter.getTemplateContent(this.current) : null;
        }

        //Mutations
        push(element) {
            this.items[++this.stackTop] = element;
            this._updateCurrentElement();

            if (this._isInTemplate()) {
                this.tmplCount++;
            }
        }

        pop() {
            this.stackTop--;

            if (this.tmplCount > 0 && this._isInTemplate()) {
                this.tmplCount--;
            }

            this._updateCurrentElement();
        }

        replace(oldElement, newElement) {
            const idx = this._indexOf(oldElement);

            this.items[idx] = newElement;

            if (idx === this.stackTop) {
                this._updateCurrentElement();
            }
        }

        insertAfter(referenceElement, newElement) {
            const insertionIdx = this._indexOf(referenceElement) + 1;

            this.items.splice(insertionIdx, 0, newElement);

            if (insertionIdx === ++this.stackTop) {
                this._updateCurrentElement();
            }
        }

        popUntilTagNamePopped(tagName) {
            while (this.stackTop > -1) {
                const tn = this.currentTagName;
                const ns = this.treeAdapter.getNamespaceURI(this.current);

                this.pop();

                if (tn === tagName && ns === NS.HTML) {
                    break;
                }
            }
        }

        popUntilElementPopped(element) {
            while (this.stackTop > -1) {
                const poppedElement = this.current;

                this.pop();

                if (poppedElement === element) {
                    break;
                }
            }
        }

        popUntilNumberedHeaderPopped() {
            while (this.stackTop > -1) {
                const tn = this.currentTagName;
                const ns = this.treeAdapter.getNamespaceURI(this.current);

                this.pop();

                if (
                    tn === $$2.H1 ||
                    tn === $$2.H2 ||
                    tn === $$2.H3 ||
                    tn === $$2.H4 ||
                    tn === $$2.H5 ||
                    (tn === $$2.H6 && ns === NS.HTML)
                ) {
                    break;
                }
            }
        }

        popUntilTableCellPopped() {
            while (this.stackTop > -1) {
                const tn = this.currentTagName;
                const ns = this.treeAdapter.getNamespaceURI(this.current);

                this.pop();

                if (tn === $$2.TD || (tn === $$2.TH && ns === NS.HTML)) {
                    break;
                }
            }
        }

        popAllUpToHtmlElement() {
            //NOTE: here we assume that root <html> element is always first in the open element stack, so
            //we perform this fast stack clean up.
            this.stackTop = 0;
            this._updateCurrentElement();
        }

        clearBackToTableContext() {
            while (
                (this.currentTagName !== $$2.TABLE && this.currentTagName !== $$2.TEMPLATE && this.currentTagName !== $$2.HTML) ||
                this.treeAdapter.getNamespaceURI(this.current) !== NS.HTML
            ) {
                this.pop();
            }
        }

        clearBackToTableBodyContext() {
            while (
                (this.currentTagName !== $$2.TBODY &&
                    this.currentTagName !== $$2.TFOOT &&
                    this.currentTagName !== $$2.THEAD &&
                    this.currentTagName !== $$2.TEMPLATE &&
                    this.currentTagName !== $$2.HTML) ||
                this.treeAdapter.getNamespaceURI(this.current) !== NS.HTML
            ) {
                this.pop();
            }
        }

        clearBackToTableRowContext() {
            while (
                (this.currentTagName !== $$2.TR && this.currentTagName !== $$2.TEMPLATE && this.currentTagName !== $$2.HTML) ||
                this.treeAdapter.getNamespaceURI(this.current) !== NS.HTML
            ) {
                this.pop();
            }
        }

        remove(element) {
            for (let i = this.stackTop; i >= 0; i--) {
                if (this.items[i] === element) {
                    this.items.splice(i, 1);
                    this.stackTop--;
                    this._updateCurrentElement();
                    break;
                }
            }
        }

        //Search
        tryPeekProperlyNestedBodyElement() {
            //Properly nested <body> element (should be second element in stack).
            const element = this.items[1];

            return element && this.treeAdapter.getTagName(element) === $$2.BODY ? element : null;
        }

        contains(element) {
            return this._indexOf(element) > -1;
        }

        getCommonAncestor(element) {
            let elementIdx = this._indexOf(element);

            return --elementIdx >= 0 ? this.items[elementIdx] : null;
        }

        isRootHtmlElementCurrent() {
            return this.stackTop === 0 && this.currentTagName === $$2.HTML;
        }

        //Element in scope
        hasInScope(tagName) {
            for (let i = this.stackTop; i >= 0; i--) {
                const tn = this.treeAdapter.getTagName(this.items[i]);
                const ns = this.treeAdapter.getNamespaceURI(this.items[i]);

                if (tn === tagName && ns === NS.HTML) {
                    return true;
                }

                if (isScopingElement(tn, ns)) {
                    return false;
                }
            }

            return true;
        }

        hasNumberedHeaderInScope() {
            for (let i = this.stackTop; i >= 0; i--) {
                const tn = this.treeAdapter.getTagName(this.items[i]);
                const ns = this.treeAdapter.getNamespaceURI(this.items[i]);

                if (
                    (tn === $$2.H1 || tn === $$2.H2 || tn === $$2.H3 || tn === $$2.H4 || tn === $$2.H5 || tn === $$2.H6) &&
                    ns === NS.HTML
                ) {
                    return true;
                }

                if (isScopingElement(tn, ns)) {
                    return false;
                }
            }

            return true;
        }

        hasInListItemScope(tagName) {
            for (let i = this.stackTop; i >= 0; i--) {
                const tn = this.treeAdapter.getTagName(this.items[i]);
                const ns = this.treeAdapter.getNamespaceURI(this.items[i]);

                if (tn === tagName && ns === NS.HTML) {
                    return true;
                }

                if (((tn === $$2.UL || tn === $$2.OL) && ns === NS.HTML) || isScopingElement(tn, ns)) {
                    return false;
                }
            }

            return true;
        }

        hasInButtonScope(tagName) {
            for (let i = this.stackTop; i >= 0; i--) {
                const tn = this.treeAdapter.getTagName(this.items[i]);
                const ns = this.treeAdapter.getNamespaceURI(this.items[i]);

                if (tn === tagName && ns === NS.HTML) {
                    return true;
                }

                if ((tn === $$2.BUTTON && ns === NS.HTML) || isScopingElement(tn, ns)) {
                    return false;
                }
            }

            return true;
        }

        hasInTableScope(tagName) {
            for (let i = this.stackTop; i >= 0; i--) {
                const tn = this.treeAdapter.getTagName(this.items[i]);
                const ns = this.treeAdapter.getNamespaceURI(this.items[i]);

                if (ns !== NS.HTML) {
                    continue;
                }

                if (tn === tagName) {
                    return true;
                }

                if (tn === $$2.TABLE || tn === $$2.TEMPLATE || tn === $$2.HTML) {
                    return false;
                }
            }

            return true;
        }

        hasTableBodyContextInTableScope() {
            for (let i = this.stackTop; i >= 0; i--) {
                const tn = this.treeAdapter.getTagName(this.items[i]);
                const ns = this.treeAdapter.getNamespaceURI(this.items[i]);

                if (ns !== NS.HTML) {
                    continue;
                }

                if (tn === $$2.TBODY || tn === $$2.THEAD || tn === $$2.TFOOT) {
                    return true;
                }

                if (tn === $$2.TABLE || tn === $$2.HTML) {
                    return false;
                }
            }

            return true;
        }

        hasInSelectScope(tagName) {
            for (let i = this.stackTop; i >= 0; i--) {
                const tn = this.treeAdapter.getTagName(this.items[i]);
                const ns = this.treeAdapter.getNamespaceURI(this.items[i]);

                if (ns !== NS.HTML) {
                    continue;
                }

                if (tn === tagName) {
                    return true;
                }

                if (tn !== $$2.OPTION && tn !== $$2.OPTGROUP) {
                    return false;
                }
            }

            return true;
        }

        //Implied end tags
        generateImpliedEndTags() {
            while (isImpliedEndTagRequired(this.currentTagName)) {
                this.pop();
            }
        }

        generateImpliedEndTagsThoroughly() {
            while (isImpliedEndTagRequiredThoroughly(this.currentTagName)) {
                this.pop();
            }
        }

        generateImpliedEndTagsWithExclusion(exclusionTagName) {
            while (isImpliedEndTagRequired(this.currentTagName) && this.currentTagName !== exclusionTagName) {
                this.pop();
            }
        }
    }

    var openElementStack = OpenElementStack;

    //Const
    const NOAH_ARK_CAPACITY = 3;

    //List of formatting elements
    class FormattingElementList {
        constructor(treeAdapter) {
            this.length = 0;
            this.entries = [];
            this.treeAdapter = treeAdapter;
            this.bookmark = null;
        }

        //Noah Ark's condition
        //OPTIMIZATION: at first we try to find possible candidates for exclusion using
        //lightweight heuristics without thorough attributes check.
        _getNoahArkConditionCandidates(newElement) {
            const candidates = [];

            if (this.length >= NOAH_ARK_CAPACITY) {
                const neAttrsLength = this.treeAdapter.getAttrList(newElement).length;
                const neTagName = this.treeAdapter.getTagName(newElement);
                const neNamespaceURI = this.treeAdapter.getNamespaceURI(newElement);

                for (let i = this.length - 1; i >= 0; i--) {
                    const entry = this.entries[i];

                    if (entry.type === FormattingElementList.MARKER_ENTRY) {
                        break;
                    }

                    const element = entry.element;
                    const elementAttrs = this.treeAdapter.getAttrList(element);

                    const isCandidate =
                        this.treeAdapter.getTagName(element) === neTagName &&
                        this.treeAdapter.getNamespaceURI(element) === neNamespaceURI &&
                        elementAttrs.length === neAttrsLength;

                    if (isCandidate) {
                        candidates.push({ idx: i, attrs: elementAttrs });
                    }
                }
            }

            return candidates.length < NOAH_ARK_CAPACITY ? [] : candidates;
        }

        _ensureNoahArkCondition(newElement) {
            const candidates = this._getNoahArkConditionCandidates(newElement);
            let cLength = candidates.length;

            if (cLength) {
                const neAttrs = this.treeAdapter.getAttrList(newElement);
                const neAttrsLength = neAttrs.length;
                const neAttrsMap = Object.create(null);

                //NOTE: build attrs map for the new element so we can perform fast lookups
                for (let i = 0; i < neAttrsLength; i++) {
                    const neAttr = neAttrs[i];

                    neAttrsMap[neAttr.name] = neAttr.value;
                }

                for (let i = 0; i < neAttrsLength; i++) {
                    for (let j = 0; j < cLength; j++) {
                        const cAttr = candidates[j].attrs[i];

                        if (neAttrsMap[cAttr.name] !== cAttr.value) {
                            candidates.splice(j, 1);
                            cLength--;
                        }

                        if (candidates.length < NOAH_ARK_CAPACITY) {
                            return;
                        }
                    }
                }

                //NOTE: remove bottommost candidates until Noah's Ark condition will not be met
                for (let i = cLength - 1; i >= NOAH_ARK_CAPACITY - 1; i--) {
                    this.entries.splice(candidates[i].idx, 1);
                    this.length--;
                }
            }
        }

        //Mutations
        insertMarker() {
            this.entries.push({ type: FormattingElementList.MARKER_ENTRY });
            this.length++;
        }

        pushElement(element, token) {
            this._ensureNoahArkCondition(element);

            this.entries.push({
                type: FormattingElementList.ELEMENT_ENTRY,
                element: element,
                token: token
            });

            this.length++;
        }

        insertElementAfterBookmark(element, token) {
            let bookmarkIdx = this.length - 1;

            for (; bookmarkIdx >= 0; bookmarkIdx--) {
                if (this.entries[bookmarkIdx] === this.bookmark) {
                    break;
                }
            }

            this.entries.splice(bookmarkIdx + 1, 0, {
                type: FormattingElementList.ELEMENT_ENTRY,
                element: element,
                token: token
            });

            this.length++;
        }

        removeEntry(entry) {
            for (let i = this.length - 1; i >= 0; i--) {
                if (this.entries[i] === entry) {
                    this.entries.splice(i, 1);
                    this.length--;
                    break;
                }
            }
        }

        clearToLastMarker() {
            while (this.length) {
                const entry = this.entries.pop();

                this.length--;

                if (entry.type === FormattingElementList.MARKER_ENTRY) {
                    break;
                }
            }
        }

        //Search
        getElementEntryInScopeWithTagName(tagName) {
            for (let i = this.length - 1; i >= 0; i--) {
                const entry = this.entries[i];

                if (entry.type === FormattingElementList.MARKER_ENTRY) {
                    return null;
                }

                if (this.treeAdapter.getTagName(entry.element) === tagName) {
                    return entry;
                }
            }

            return null;
        }

        getElementEntry(element) {
            for (let i = this.length - 1; i >= 0; i--) {
                const entry = this.entries[i];

                if (entry.type === FormattingElementList.ELEMENT_ENTRY && entry.element === element) {
                    return entry;
                }
            }

            return null;
        }
    }

    //Entry types
    FormattingElementList.MARKER_ENTRY = 'MARKER_ENTRY';
    FormattingElementList.ELEMENT_ENTRY = 'ELEMENT_ENTRY';

    var formattingElementList = FormattingElementList;

    class Mixin {
        constructor(host) {
            const originalMethods = {};
            const overriddenMethods = this._getOverriddenMethods(this, originalMethods);

            for (const key of Object.keys(overriddenMethods)) {
                if (typeof overriddenMethods[key] === 'function') {
                    originalMethods[key] = host[key];
                    host[key] = overriddenMethods[key];
                }
            }
        }

        _getOverriddenMethods() {
            throw new Error('Not implemented');
        }
    }

    Mixin.install = function(host, Ctor, opts) {
        if (!host.__mixins) {
            host.__mixins = [];
        }

        for (let i = 0; i < host.__mixins.length; i++) {
            if (host.__mixins[i].constructor === Ctor) {
                return host.__mixins[i];
            }
        }

        const mixin = new Ctor(host, opts);

        host.__mixins.push(mixin);

        return mixin;
    };

    var mixin = Mixin;

    class PositionTrackingPreprocessorMixin extends mixin {
        constructor(preprocessor) {
            super(preprocessor);

            this.preprocessor = preprocessor;
            this.isEol = false;
            this.lineStartPos = 0;
            this.droppedBufferSize = 0;

            this.offset = 0;
            this.col = 0;
            this.line = 1;
        }

        _getOverriddenMethods(mxn, orig) {
            return {
                advance() {
                    const pos = this.pos + 1;
                    const ch = this.html[pos];

                    //NOTE: LF should be in the last column of the line
                    if (mxn.isEol) {
                        mxn.isEol = false;
                        mxn.line++;
                        mxn.lineStartPos = pos;
                    }

                    if (ch === '\n' || (ch === '\r' && this.html[pos + 1] !== '\n')) {
                        mxn.isEol = true;
                    }

                    mxn.col = pos - mxn.lineStartPos + 1;
                    mxn.offset = mxn.droppedBufferSize + pos;

                    return orig.advance.call(this);
                },

                retreat() {
                    orig.retreat.call(this);

                    mxn.isEol = false;
                    mxn.col = this.pos - mxn.lineStartPos + 1;
                },

                dropParsedChunk() {
                    const prevPos = this.pos;

                    orig.dropParsedChunk.call(this);

                    const reduction = prevPos - this.pos;

                    mxn.lineStartPos -= reduction;
                    mxn.droppedBufferSize += reduction;
                    mxn.offset = mxn.droppedBufferSize + this.pos;
                }
            };
        }
    }

    var preprocessorMixin = PositionTrackingPreprocessorMixin;

    class LocationInfoTokenizerMixin extends mixin {
        constructor(tokenizer) {
            super(tokenizer);

            this.tokenizer = tokenizer;
            this.posTracker = mixin.install(tokenizer.preprocessor, preprocessorMixin);
            this.currentAttrLocation = null;
            this.ctLoc = null;
        }

        _getCurrentLocation() {
            return {
                startLine: this.posTracker.line,
                startCol: this.posTracker.col,
                startOffset: this.posTracker.offset,
                endLine: -1,
                endCol: -1,
                endOffset: -1
            };
        }

        _attachCurrentAttrLocationInfo() {
            this.currentAttrLocation.endLine = this.posTracker.line;
            this.currentAttrLocation.endCol = this.posTracker.col;
            this.currentAttrLocation.endOffset = this.posTracker.offset;

            const currentToken = this.tokenizer.currentToken;
            const currentAttr = this.tokenizer.currentAttr;

            if (!currentToken.location.attrs) {
                currentToken.location.attrs = Object.create(null);
            }

            currentToken.location.attrs[currentAttr.name] = this.currentAttrLocation;
        }

        _getOverriddenMethods(mxn, orig) {
            const methods = {
                _createStartTagToken() {
                    orig._createStartTagToken.call(this);
                    this.currentToken.location = mxn.ctLoc;
                },

                _createEndTagToken() {
                    orig._createEndTagToken.call(this);
                    this.currentToken.location = mxn.ctLoc;
                },

                _createCommentToken() {
                    orig._createCommentToken.call(this);
                    this.currentToken.location = mxn.ctLoc;
                },

                _createDoctypeToken(initialName) {
                    orig._createDoctypeToken.call(this, initialName);
                    this.currentToken.location = mxn.ctLoc;
                },

                _createCharacterToken(type, ch) {
                    orig._createCharacterToken.call(this, type, ch);
                    this.currentCharacterToken.location = mxn.ctLoc;
                },

                _createEOFToken() {
                    orig._createEOFToken.call(this);
                    this.currentToken.location = mxn._getCurrentLocation();
                },

                _createAttr(attrNameFirstCh) {
                    orig._createAttr.call(this, attrNameFirstCh);
                    mxn.currentAttrLocation = mxn._getCurrentLocation();
                },

                _leaveAttrName(toState) {
                    orig._leaveAttrName.call(this, toState);
                    mxn._attachCurrentAttrLocationInfo();
                },

                _leaveAttrValue(toState) {
                    orig._leaveAttrValue.call(this, toState);
                    mxn._attachCurrentAttrLocationInfo();
                },

                _emitCurrentToken() {
                    const ctLoc = this.currentToken.location;

                    //NOTE: if we have pending character token make it's end location equal to the
                    //current token's start location.
                    if (this.currentCharacterToken) {
                        this.currentCharacterToken.location.endLine = ctLoc.startLine;
                        this.currentCharacterToken.location.endCol = ctLoc.startCol;
                        this.currentCharacterToken.location.endOffset = ctLoc.startOffset;
                    }

                    if (this.currentToken.type === tokenizer.EOF_TOKEN) {
                        ctLoc.endLine = ctLoc.startLine;
                        ctLoc.endCol = ctLoc.startCol;
                        ctLoc.endOffset = ctLoc.startOffset;
                    } else {
                        ctLoc.endLine = mxn.posTracker.line;
                        ctLoc.endCol = mxn.posTracker.col + 1;
                        ctLoc.endOffset = mxn.posTracker.offset + 1;
                    }

                    orig._emitCurrentToken.call(this);
                },

                _emitCurrentCharacterToken() {
                    const ctLoc = this.currentCharacterToken && this.currentCharacterToken.location;

                    //NOTE: if we have character token and it's location wasn't set in the _emitCurrentToken(),
                    //then set it's location at the current preprocessor position.
                    //We don't need to increment preprocessor position, since character token
                    //emission is always forced by the start of the next character token here.
                    //So, we already have advanced position.
                    if (ctLoc && ctLoc.endOffset === -1) {
                        ctLoc.endLine = mxn.posTracker.line;
                        ctLoc.endCol = mxn.posTracker.col;
                        ctLoc.endOffset = mxn.posTracker.offset;
                    }

                    orig._emitCurrentCharacterToken.call(this);
                }
            };

            //NOTE: patch initial states for each mode to obtain token start position
            Object.keys(tokenizer.MODE).forEach(modeName => {
                const state = tokenizer.MODE[modeName];

                methods[state] = function(cp) {
                    mxn.ctLoc = mxn._getCurrentLocation();
                    orig[state].call(this, cp);
                };
            });

            return methods;
        }
    }

    var tokenizerMixin = LocationInfoTokenizerMixin;

    class LocationInfoOpenElementStackMixin extends mixin {
        constructor(stack, opts) {
            super(stack);

            this.onItemPop = opts.onItemPop;
        }

        _getOverriddenMethods(mxn, orig) {
            return {
                pop() {
                    mxn.onItemPop(this.current);
                    orig.pop.call(this);
                },

                popAllUpToHtmlElement() {
                    for (let i = this.stackTop; i > 0; i--) {
                        mxn.onItemPop(this.items[i]);
                    }

                    orig.popAllUpToHtmlElement.call(this);
                },

                remove(element) {
                    mxn.onItemPop(this.current);
                    orig.remove.call(this, element);
                }
            };
        }
    }

    var openElementStackMixin = LocationInfoOpenElementStackMixin;

    //Aliases
    const $$3 = html$1.TAG_NAMES;

    class LocationInfoParserMixin extends mixin {
        constructor(parser) {
            super(parser);

            this.parser = parser;
            this.treeAdapter = this.parser.treeAdapter;
            this.posTracker = null;
            this.lastStartTagToken = null;
            this.lastFosterParentingLocation = null;
            this.currentToken = null;
        }

        _setStartLocation(element) {
            let loc = null;

            if (this.lastStartTagToken) {
                loc = Object.assign({}, this.lastStartTagToken.location);
                loc.startTag = this.lastStartTagToken.location;
            }

            this.treeAdapter.setNodeSourceCodeLocation(element, loc);
        }

        _setEndLocation(element, closingToken) {
            const loc = this.treeAdapter.getNodeSourceCodeLocation(element);

            if (loc) {
                if (closingToken.location) {
                    const ctLoc = closingToken.location;
                    const tn = this.treeAdapter.getTagName(element);

                    // NOTE: For cases like <p> <p> </p> - First 'p' closes without a closing
                    // tag and for cases like <td> <p> </td> - 'p' closes without a closing tag.
                    const isClosingEndTag = closingToken.type === tokenizer.END_TAG_TOKEN && tn === closingToken.tagName;
                    const endLoc = {};
                    if (isClosingEndTag) {
                        endLoc.endTag = Object.assign({}, ctLoc);
                        endLoc.endLine = ctLoc.endLine;
                        endLoc.endCol = ctLoc.endCol;
                        endLoc.endOffset = ctLoc.endOffset;
                    } else {
                        endLoc.endLine = ctLoc.startLine;
                        endLoc.endCol = ctLoc.startCol;
                        endLoc.endOffset = ctLoc.startOffset;
                    }

                    this.treeAdapter.updateNodeSourceCodeLocation(element, endLoc);
                }
            }
        }

        _getOverriddenMethods(mxn, orig) {
            return {
                _bootstrap(document, fragmentContext) {
                    orig._bootstrap.call(this, document, fragmentContext);

                    mxn.lastStartTagToken = null;
                    mxn.lastFosterParentingLocation = null;
                    mxn.currentToken = null;

                    const tokenizerMixin$1 = mixin.install(this.tokenizer, tokenizerMixin);

                    mxn.posTracker = tokenizerMixin$1.posTracker;

                    mixin.install(this.openElements, openElementStackMixin, {
                        onItemPop: function(element) {
                            mxn._setEndLocation(element, mxn.currentToken);
                        }
                    });
                },

                _runParsingLoop(scriptHandler) {
                    orig._runParsingLoop.call(this, scriptHandler);

                    // NOTE: generate location info for elements
                    // that remains on open element stack
                    for (let i = this.openElements.stackTop; i >= 0; i--) {
                        mxn._setEndLocation(this.openElements.items[i], mxn.currentToken);
                    }
                },

                //Token processing
                _processTokenInForeignContent(token) {
                    mxn.currentToken = token;
                    orig._processTokenInForeignContent.call(this, token);
                },

                _processToken(token) {
                    mxn.currentToken = token;
                    orig._processToken.call(this, token);

                    //NOTE: <body> and <html> are never popped from the stack, so we need to updated
                    //their end location explicitly.
                    const requireExplicitUpdate =
                        token.type === tokenizer.END_TAG_TOKEN &&
                        (token.tagName === $$3.HTML || (token.tagName === $$3.BODY && this.openElements.hasInScope($$3.BODY)));

                    if (requireExplicitUpdate) {
                        for (let i = this.openElements.stackTop; i >= 0; i--) {
                            const element = this.openElements.items[i];

                            if (this.treeAdapter.getTagName(element) === token.tagName) {
                                mxn._setEndLocation(element, token);
                                break;
                            }
                        }
                    }
                },

                //Doctype
                _setDocumentType(token) {
                    orig._setDocumentType.call(this, token);

                    const documentChildren = this.treeAdapter.getChildNodes(this.document);
                    const cnLength = documentChildren.length;

                    for (let i = 0; i < cnLength; i++) {
                        const node = documentChildren[i];

                        if (this.treeAdapter.isDocumentTypeNode(node)) {
                            this.treeAdapter.setNodeSourceCodeLocation(node, token.location);
                            break;
                        }
                    }
                },

                //Elements
                _attachElementToTree(element) {
                    //NOTE: _attachElementToTree is called from _appendElement, _insertElement and _insertTemplate methods.
                    //So we will use token location stored in this methods for the element.
                    mxn._setStartLocation(element);
                    mxn.lastStartTagToken = null;
                    orig._attachElementToTree.call(this, element);
                },

                _appendElement(token, namespaceURI) {
                    mxn.lastStartTagToken = token;
                    orig._appendElement.call(this, token, namespaceURI);
                },

                _insertElement(token, namespaceURI) {
                    mxn.lastStartTagToken = token;
                    orig._insertElement.call(this, token, namespaceURI);
                },

                _insertTemplate(token) {
                    mxn.lastStartTagToken = token;
                    orig._insertTemplate.call(this, token);

                    const tmplContent = this.treeAdapter.getTemplateContent(this.openElements.current);

                    this.treeAdapter.setNodeSourceCodeLocation(tmplContent, null);
                },

                _insertFakeRootElement() {
                    orig._insertFakeRootElement.call(this);
                    this.treeAdapter.setNodeSourceCodeLocation(this.openElements.current, null);
                },

                //Comments
                _appendCommentNode(token, parent) {
                    orig._appendCommentNode.call(this, token, parent);

                    const children = this.treeAdapter.getChildNodes(parent);
                    const commentNode = children[children.length - 1];

                    this.treeAdapter.setNodeSourceCodeLocation(commentNode, token.location);
                },

                //Text
                _findFosterParentingLocation() {
                    //NOTE: store last foster parenting location, so we will be able to find inserted text
                    //in case of foster parenting
                    mxn.lastFosterParentingLocation = orig._findFosterParentingLocation.call(this);

                    return mxn.lastFosterParentingLocation;
                },

                _insertCharacters(token) {
                    orig._insertCharacters.call(this, token);

                    const hasFosterParent = this._shouldFosterParentOnInsertion();

                    const parent =
                        (hasFosterParent && mxn.lastFosterParentingLocation.parent) ||
                        this.openElements.currentTmplContent ||
                        this.openElements.current;

                    const siblings = this.treeAdapter.getChildNodes(parent);

                    const textNodeIdx =
                        hasFosterParent && mxn.lastFosterParentingLocation.beforeElement
                            ? siblings.indexOf(mxn.lastFosterParentingLocation.beforeElement) - 1
                            : siblings.length - 1;

                    const textNode = siblings[textNodeIdx];

                    //NOTE: if we have location assigned by another token, then just update end position
                    const tnLoc = this.treeAdapter.getNodeSourceCodeLocation(textNode);

                    if (tnLoc) {
                        const { endLine, endCol, endOffset } = token.location;
                        this.treeAdapter.updateNodeSourceCodeLocation(textNode, { endLine, endCol, endOffset });
                    } else {
                        this.treeAdapter.setNodeSourceCodeLocation(textNode, token.location);
                    }
                }
            };
        }
    }

    var parserMixin = LocationInfoParserMixin;

    class ErrorReportingMixinBase extends mixin {
        constructor(host, opts) {
            super(host);

            this.posTracker = null;
            this.onParseError = opts.onParseError;
        }

        _setErrorLocation(err) {
            err.startLine = err.endLine = this.posTracker.line;
            err.startCol = err.endCol = this.posTracker.col;
            err.startOffset = err.endOffset = this.posTracker.offset;
        }

        _reportError(code) {
            const err = {
                code: code,
                startLine: -1,
                startCol: -1,
                startOffset: -1,
                endLine: -1,
                endCol: -1,
                endOffset: -1
            };

            this._setErrorLocation(err);
            this.onParseError(err);
        }

        _getOverriddenMethods(mxn) {
            return {
                _err(code) {
                    mxn._reportError(code);
                }
            };
        }
    }

    var mixinBase = ErrorReportingMixinBase;

    class ErrorReportingPreprocessorMixin extends mixinBase {
        constructor(preprocessor, opts) {
            super(preprocessor, opts);

            this.posTracker = mixin.install(preprocessor, preprocessorMixin);
            this.lastErrOffset = -1;
        }

        _reportError(code) {
            //NOTE: avoid reporting error twice on advance/retreat
            if (this.lastErrOffset !== this.posTracker.offset) {
                this.lastErrOffset = this.posTracker.offset;
                super._reportError(code);
            }
        }
    }

    var preprocessorMixin$1 = ErrorReportingPreprocessorMixin;

    class ErrorReportingTokenizerMixin extends mixinBase {
        constructor(tokenizer, opts) {
            super(tokenizer, opts);

            const preprocessorMixin = mixin.install(tokenizer.preprocessor, preprocessorMixin$1, opts);

            this.posTracker = preprocessorMixin.posTracker;
        }
    }

    var tokenizerMixin$1 = ErrorReportingTokenizerMixin;

    class ErrorReportingParserMixin extends mixinBase {
        constructor(parser, opts) {
            super(parser, opts);

            this.opts = opts;
            this.ctLoc = null;
            this.locBeforeToken = false;
        }

        _setErrorLocation(err) {
            if (this.ctLoc) {
                err.startLine = this.ctLoc.startLine;
                err.startCol = this.ctLoc.startCol;
                err.startOffset = this.ctLoc.startOffset;

                err.endLine = this.locBeforeToken ? this.ctLoc.startLine : this.ctLoc.endLine;
                err.endCol = this.locBeforeToken ? this.ctLoc.startCol : this.ctLoc.endCol;
                err.endOffset = this.locBeforeToken ? this.ctLoc.startOffset : this.ctLoc.endOffset;
            }
        }

        _getOverriddenMethods(mxn, orig) {
            return {
                _bootstrap(document, fragmentContext) {
                    orig._bootstrap.call(this, document, fragmentContext);

                    mixin.install(this.tokenizer, tokenizerMixin$1, mxn.opts);
                    mixin.install(this.tokenizer, tokenizerMixin);
                },

                _processInputToken(token) {
                    mxn.ctLoc = token.location;

                    orig._processInputToken.call(this, token);
                },

                _err(code, options) {
                    mxn.locBeforeToken = options && options.beforeToken;
                    mxn._reportError(code);
                }
            };
        }
    }

    var parserMixin$1 = ErrorReportingParserMixin;

    var _default = createCommonjsModule(function (module, exports) {

    const { DOCUMENT_MODE } = html$1;

    //Node construction
    exports.createDocument = function() {
        return {
            nodeName: '#document',
            mode: DOCUMENT_MODE.NO_QUIRKS,
            childNodes: []
        };
    };

    exports.createDocumentFragment = function() {
        return {
            nodeName: '#document-fragment',
            childNodes: []
        };
    };

    exports.createElement = function(tagName, namespaceURI, attrs) {
        return {
            nodeName: tagName,
            tagName: tagName,
            attrs: attrs,
            namespaceURI: namespaceURI,
            childNodes: [],
            parentNode: null
        };
    };

    exports.createCommentNode = function(data) {
        return {
            nodeName: '#comment',
            data: data,
            parentNode: null
        };
    };

    const createTextNode = function(value) {
        return {
            nodeName: '#text',
            value: value,
            parentNode: null
        };
    };

    //Tree mutation
    const appendChild = (exports.appendChild = function(parentNode, newNode) {
        parentNode.childNodes.push(newNode);
        newNode.parentNode = parentNode;
    });

    const insertBefore = (exports.insertBefore = function(parentNode, newNode, referenceNode) {
        const insertionIdx = parentNode.childNodes.indexOf(referenceNode);

        parentNode.childNodes.splice(insertionIdx, 0, newNode);
        newNode.parentNode = parentNode;
    });

    exports.setTemplateContent = function(templateElement, contentElement) {
        templateElement.content = contentElement;
    };

    exports.getTemplateContent = function(templateElement) {
        return templateElement.content;
    };

    exports.setDocumentType = function(document, name, publicId, systemId) {
        let doctypeNode = null;

        for (let i = 0; i < document.childNodes.length; i++) {
            if (document.childNodes[i].nodeName === '#documentType') {
                doctypeNode = document.childNodes[i];
                break;
            }
        }

        if (doctypeNode) {
            doctypeNode.name = name;
            doctypeNode.publicId = publicId;
            doctypeNode.systemId = systemId;
        } else {
            appendChild(document, {
                nodeName: '#documentType',
                name: name,
                publicId: publicId,
                systemId: systemId
            });
        }
    };

    exports.setDocumentMode = function(document, mode) {
        document.mode = mode;
    };

    exports.getDocumentMode = function(document) {
        return document.mode;
    };

    exports.detachNode = function(node) {
        if (node.parentNode) {
            const idx = node.parentNode.childNodes.indexOf(node);

            node.parentNode.childNodes.splice(idx, 1);
            node.parentNode = null;
        }
    };

    exports.insertText = function(parentNode, text) {
        if (parentNode.childNodes.length) {
            const prevNode = parentNode.childNodes[parentNode.childNodes.length - 1];

            if (prevNode.nodeName === '#text') {
                prevNode.value += text;
                return;
            }
        }

        appendChild(parentNode, createTextNode(text));
    };

    exports.insertTextBefore = function(parentNode, text, referenceNode) {
        const prevNode = parentNode.childNodes[parentNode.childNodes.indexOf(referenceNode) - 1];

        if (prevNode && prevNode.nodeName === '#text') {
            prevNode.value += text;
        } else {
            insertBefore(parentNode, createTextNode(text), referenceNode);
        }
    };

    exports.adoptAttributes = function(recipient, attrs) {
        const recipientAttrsMap = [];

        for (let i = 0; i < recipient.attrs.length; i++) {
            recipientAttrsMap.push(recipient.attrs[i].name);
        }

        for (let j = 0; j < attrs.length; j++) {
            if (recipientAttrsMap.indexOf(attrs[j].name) === -1) {
                recipient.attrs.push(attrs[j]);
            }
        }
    };

    //Tree traversing
    exports.getFirstChild = function(node) {
        return node.childNodes[0];
    };

    exports.getChildNodes = function(node) {
        return node.childNodes;
    };

    exports.getParentNode = function(node) {
        return node.parentNode;
    };

    exports.getAttrList = function(element) {
        return element.attrs;
    };

    //Node data
    exports.getTagName = function(element) {
        return element.tagName;
    };

    exports.getNamespaceURI = function(element) {
        return element.namespaceURI;
    };

    exports.getTextNodeContent = function(textNode) {
        return textNode.value;
    };

    exports.getCommentNodeContent = function(commentNode) {
        return commentNode.data;
    };

    exports.getDocumentTypeNodeName = function(doctypeNode) {
        return doctypeNode.name;
    };

    exports.getDocumentTypeNodePublicId = function(doctypeNode) {
        return doctypeNode.publicId;
    };

    exports.getDocumentTypeNodeSystemId = function(doctypeNode) {
        return doctypeNode.systemId;
    };

    //Node types
    exports.isTextNode = function(node) {
        return node.nodeName === '#text';
    };

    exports.isCommentNode = function(node) {
        return node.nodeName === '#comment';
    };

    exports.isDocumentTypeNode = function(node) {
        return node.nodeName === '#documentType';
    };

    exports.isElementNode = function(node) {
        return !!node.tagName;
    };

    // Source code location
    exports.setNodeSourceCodeLocation = function(node, location) {
        node.sourceCodeLocation = location;
    };

    exports.getNodeSourceCodeLocation = function(node) {
        return node.sourceCodeLocation;
    };

    exports.updateNodeSourceCodeLocation = function(node, endLocation) {
        node.sourceCodeLocation = Object.assign(node.sourceCodeLocation, endLocation);
    };
    });

    var mergeOptions = function mergeOptions(defaults, options) {
        options = options || Object.create(null);

        return [defaults, options].reduce((merged, optObj) => {
            Object.keys(optObj).forEach(key => {
                merged[key] = optObj[key];
            });

            return merged;
        }, Object.create(null));
    };

    const { DOCUMENT_MODE } = html$1;

    //Const
    const VALID_DOCTYPE_NAME = 'html';
    const VALID_SYSTEM_ID = 'about:legacy-compat';
    const QUIRKS_MODE_SYSTEM_ID = 'http://www.ibm.com/data/dtd/v11/ibmxhtml1-transitional.dtd';

    const QUIRKS_MODE_PUBLIC_ID_PREFIXES = [
        '+//silmaril//dtd html pro v0r11 19970101//',
        '-//as//dtd html 3.0 aswedit + extensions//',
        '-//advasoft ltd//dtd html 3.0 aswedit + extensions//',
        '-//ietf//dtd html 2.0 level 1//',
        '-//ietf//dtd html 2.0 level 2//',
        '-//ietf//dtd html 2.0 strict level 1//',
        '-//ietf//dtd html 2.0 strict level 2//',
        '-//ietf//dtd html 2.0 strict//',
        '-//ietf//dtd html 2.0//',
        '-//ietf//dtd html 2.1e//',
        '-//ietf//dtd html 3.0//',
        '-//ietf//dtd html 3.2 final//',
        '-//ietf//dtd html 3.2//',
        '-//ietf//dtd html 3//',
        '-//ietf//dtd html level 0//',
        '-//ietf//dtd html level 1//',
        '-//ietf//dtd html level 2//',
        '-//ietf//dtd html level 3//',
        '-//ietf//dtd html strict level 0//',
        '-//ietf//dtd html strict level 1//',
        '-//ietf//dtd html strict level 2//',
        '-//ietf//dtd html strict level 3//',
        '-//ietf//dtd html strict//',
        '-//ietf//dtd html//',
        '-//metrius//dtd metrius presentational//',
        '-//microsoft//dtd internet explorer 2.0 html strict//',
        '-//microsoft//dtd internet explorer 2.0 html//',
        '-//microsoft//dtd internet explorer 2.0 tables//',
        '-//microsoft//dtd internet explorer 3.0 html strict//',
        '-//microsoft//dtd internet explorer 3.0 html//',
        '-//microsoft//dtd internet explorer 3.0 tables//',
        '-//netscape comm. corp.//dtd html//',
        '-//netscape comm. corp.//dtd strict html//',
        "-//o'reilly and associates//dtd html 2.0//",
        "-//o'reilly and associates//dtd html extended 1.0//",
        "-//o'reilly and associates//dtd html extended relaxed 1.0//",
        '-//sq//dtd html 2.0 hotmetal + extensions//',
        '-//softquad software//dtd hotmetal pro 6.0::19990601::extensions to html 4.0//',
        '-//softquad//dtd hotmetal pro 4.0::19971010::extensions to html 4.0//',
        '-//spyglass//dtd html 2.0 extended//',
        '-//sun microsystems corp.//dtd hotjava html//',
        '-//sun microsystems corp.//dtd hotjava strict html//',
        '-//w3c//dtd html 3 1995-03-24//',
        '-//w3c//dtd html 3.2 draft//',
        '-//w3c//dtd html 3.2 final//',
        '-//w3c//dtd html 3.2//',
        '-//w3c//dtd html 3.2s draft//',
        '-//w3c//dtd html 4.0 frameset//',
        '-//w3c//dtd html 4.0 transitional//',
        '-//w3c//dtd html experimental 19960712//',
        '-//w3c//dtd html experimental 970421//',
        '-//w3c//dtd w3 html//',
        '-//w3o//dtd w3 html 3.0//',
        '-//webtechs//dtd mozilla html 2.0//',
        '-//webtechs//dtd mozilla html//'
    ];

    const QUIRKS_MODE_NO_SYSTEM_ID_PUBLIC_ID_PREFIXES = QUIRKS_MODE_PUBLIC_ID_PREFIXES.concat([
        '-//w3c//dtd html 4.01 frameset//',
        '-//w3c//dtd html 4.01 transitional//'
    ]);

    const QUIRKS_MODE_PUBLIC_IDS = ['-//w3o//dtd w3 html strict 3.0//en//', '-/w3c/dtd html 4.0 transitional/en', 'html'];
    const LIMITED_QUIRKS_PUBLIC_ID_PREFIXES = ['-//w3c//dtd xhtml 1.0 frameset//', '-//w3c//dtd xhtml 1.0 transitional//'];

    const LIMITED_QUIRKS_WITH_SYSTEM_ID_PUBLIC_ID_PREFIXES = LIMITED_QUIRKS_PUBLIC_ID_PREFIXES.concat([
        '-//w3c//dtd html 4.01 frameset//',
        '-//w3c//dtd html 4.01 transitional//'
    ]);

    //Utils
    function enquoteDoctypeId(id) {
        const quote = id.indexOf('"') !== -1 ? "'" : '"';

        return quote + id + quote;
    }

    function hasPrefix(publicId, prefixes) {
        for (let i = 0; i < prefixes.length; i++) {
            if (publicId.indexOf(prefixes[i]) === 0) {
                return true;
            }
        }

        return false;
    }

    //API
    var isConforming = function(token) {
        return (
            token.name === VALID_DOCTYPE_NAME &&
            token.publicId === null &&
            (token.systemId === null || token.systemId === VALID_SYSTEM_ID)
        );
    };

    var getDocumentMode = function(token) {
        if (token.name !== VALID_DOCTYPE_NAME) {
            return DOCUMENT_MODE.QUIRKS;
        }

        const systemId = token.systemId;

        if (systemId && systemId.toLowerCase() === QUIRKS_MODE_SYSTEM_ID) {
            return DOCUMENT_MODE.QUIRKS;
        }

        let publicId = token.publicId;

        if (publicId !== null) {
            publicId = publicId.toLowerCase();

            if (QUIRKS_MODE_PUBLIC_IDS.indexOf(publicId) > -1) {
                return DOCUMENT_MODE.QUIRKS;
            }

            let prefixes = systemId === null ? QUIRKS_MODE_NO_SYSTEM_ID_PUBLIC_ID_PREFIXES : QUIRKS_MODE_PUBLIC_ID_PREFIXES;

            if (hasPrefix(publicId, prefixes)) {
                return DOCUMENT_MODE.QUIRKS;
            }

            prefixes =
                systemId === null ? LIMITED_QUIRKS_PUBLIC_ID_PREFIXES : LIMITED_QUIRKS_WITH_SYSTEM_ID_PUBLIC_ID_PREFIXES;

            if (hasPrefix(publicId, prefixes)) {
                return DOCUMENT_MODE.LIMITED_QUIRKS;
            }
        }

        return DOCUMENT_MODE.NO_QUIRKS;
    };

    var serializeContent = function(name, publicId, systemId) {
        let str = '!DOCTYPE ';

        if (name) {
            str += name;
        }

        if (publicId) {
            str += ' PUBLIC ' + enquoteDoctypeId(publicId);
        } else if (systemId) {
            str += ' SYSTEM';
        }

        if (systemId !== null) {
            str += ' ' + enquoteDoctypeId(systemId);
        }

        return str;
    };

    var doctype = {
    	isConforming: isConforming,
    	getDocumentMode: getDocumentMode,
    	serializeContent: serializeContent
    };

    var foreignContent = createCommonjsModule(function (module, exports) {




    //Aliases
    const $ = html$1.TAG_NAMES;
    const NS = html$1.NAMESPACES;
    const ATTRS = html$1.ATTRS;

    //MIME types
    const MIME_TYPES = {
        TEXT_HTML: 'text/html',
        APPLICATION_XML: 'application/xhtml+xml'
    };

    //Attributes
    const DEFINITION_URL_ATTR = 'definitionurl';
    const ADJUSTED_DEFINITION_URL_ATTR = 'definitionURL';
    const SVG_ATTRS_ADJUSTMENT_MAP = {
        attributename: 'attributeName',
        attributetype: 'attributeType',
        basefrequency: 'baseFrequency',
        baseprofile: 'baseProfile',
        calcmode: 'calcMode',
        clippathunits: 'clipPathUnits',
        diffuseconstant: 'diffuseConstant',
        edgemode: 'edgeMode',
        filterunits: 'filterUnits',
        glyphref: 'glyphRef',
        gradienttransform: 'gradientTransform',
        gradientunits: 'gradientUnits',
        kernelmatrix: 'kernelMatrix',
        kernelunitlength: 'kernelUnitLength',
        keypoints: 'keyPoints',
        keysplines: 'keySplines',
        keytimes: 'keyTimes',
        lengthadjust: 'lengthAdjust',
        limitingconeangle: 'limitingConeAngle',
        markerheight: 'markerHeight',
        markerunits: 'markerUnits',
        markerwidth: 'markerWidth',
        maskcontentunits: 'maskContentUnits',
        maskunits: 'maskUnits',
        numoctaves: 'numOctaves',
        pathlength: 'pathLength',
        patterncontentunits: 'patternContentUnits',
        patterntransform: 'patternTransform',
        patternunits: 'patternUnits',
        pointsatx: 'pointsAtX',
        pointsaty: 'pointsAtY',
        pointsatz: 'pointsAtZ',
        preservealpha: 'preserveAlpha',
        preserveaspectratio: 'preserveAspectRatio',
        primitiveunits: 'primitiveUnits',
        refx: 'refX',
        refy: 'refY',
        repeatcount: 'repeatCount',
        repeatdur: 'repeatDur',
        requiredextensions: 'requiredExtensions',
        requiredfeatures: 'requiredFeatures',
        specularconstant: 'specularConstant',
        specularexponent: 'specularExponent',
        spreadmethod: 'spreadMethod',
        startoffset: 'startOffset',
        stddeviation: 'stdDeviation',
        stitchtiles: 'stitchTiles',
        surfacescale: 'surfaceScale',
        systemlanguage: 'systemLanguage',
        tablevalues: 'tableValues',
        targetx: 'targetX',
        targety: 'targetY',
        textlength: 'textLength',
        viewbox: 'viewBox',
        viewtarget: 'viewTarget',
        xchannelselector: 'xChannelSelector',
        ychannelselector: 'yChannelSelector',
        zoomandpan: 'zoomAndPan'
    };

    const XML_ATTRS_ADJUSTMENT_MAP = {
        'xlink:actuate': { prefix: 'xlink', name: 'actuate', namespace: NS.XLINK },
        'xlink:arcrole': { prefix: 'xlink', name: 'arcrole', namespace: NS.XLINK },
        'xlink:href': { prefix: 'xlink', name: 'href', namespace: NS.XLINK },
        'xlink:role': { prefix: 'xlink', name: 'role', namespace: NS.XLINK },
        'xlink:show': { prefix: 'xlink', name: 'show', namespace: NS.XLINK },
        'xlink:title': { prefix: 'xlink', name: 'title', namespace: NS.XLINK },
        'xlink:type': { prefix: 'xlink', name: 'type', namespace: NS.XLINK },
        'xml:base': { prefix: 'xml', name: 'base', namespace: NS.XML },
        'xml:lang': { prefix: 'xml', name: 'lang', namespace: NS.XML },
        'xml:space': { prefix: 'xml', name: 'space', namespace: NS.XML },
        xmlns: { prefix: '', name: 'xmlns', namespace: NS.XMLNS },
        'xmlns:xlink': { prefix: 'xmlns', name: 'xlink', namespace: NS.XMLNS }
    };

    //SVG tag names adjustment map
    const SVG_TAG_NAMES_ADJUSTMENT_MAP = (exports.SVG_TAG_NAMES_ADJUSTMENT_MAP = {
        altglyph: 'altGlyph',
        altglyphdef: 'altGlyphDef',
        altglyphitem: 'altGlyphItem',
        animatecolor: 'animateColor',
        animatemotion: 'animateMotion',
        animatetransform: 'animateTransform',
        clippath: 'clipPath',
        feblend: 'feBlend',
        fecolormatrix: 'feColorMatrix',
        fecomponenttransfer: 'feComponentTransfer',
        fecomposite: 'feComposite',
        feconvolvematrix: 'feConvolveMatrix',
        fediffuselighting: 'feDiffuseLighting',
        fedisplacementmap: 'feDisplacementMap',
        fedistantlight: 'feDistantLight',
        feflood: 'feFlood',
        fefunca: 'feFuncA',
        fefuncb: 'feFuncB',
        fefuncg: 'feFuncG',
        fefuncr: 'feFuncR',
        fegaussianblur: 'feGaussianBlur',
        feimage: 'feImage',
        femerge: 'feMerge',
        femergenode: 'feMergeNode',
        femorphology: 'feMorphology',
        feoffset: 'feOffset',
        fepointlight: 'fePointLight',
        fespecularlighting: 'feSpecularLighting',
        fespotlight: 'feSpotLight',
        fetile: 'feTile',
        feturbulence: 'feTurbulence',
        foreignobject: 'foreignObject',
        glyphref: 'glyphRef',
        lineargradient: 'linearGradient',
        radialgradient: 'radialGradient',
        textpath: 'textPath'
    });

    //Tags that causes exit from foreign content
    const EXITS_FOREIGN_CONTENT = {
        [$.B]: true,
        [$.BIG]: true,
        [$.BLOCKQUOTE]: true,
        [$.BODY]: true,
        [$.BR]: true,
        [$.CENTER]: true,
        [$.CODE]: true,
        [$.DD]: true,
        [$.DIV]: true,
        [$.DL]: true,
        [$.DT]: true,
        [$.EM]: true,
        [$.EMBED]: true,
        [$.H1]: true,
        [$.H2]: true,
        [$.H3]: true,
        [$.H4]: true,
        [$.H5]: true,
        [$.H6]: true,
        [$.HEAD]: true,
        [$.HR]: true,
        [$.I]: true,
        [$.IMG]: true,
        [$.LI]: true,
        [$.LISTING]: true,
        [$.MENU]: true,
        [$.META]: true,
        [$.NOBR]: true,
        [$.OL]: true,
        [$.P]: true,
        [$.PRE]: true,
        [$.RUBY]: true,
        [$.S]: true,
        [$.SMALL]: true,
        [$.SPAN]: true,
        [$.STRONG]: true,
        [$.STRIKE]: true,
        [$.SUB]: true,
        [$.SUP]: true,
        [$.TABLE]: true,
        [$.TT]: true,
        [$.U]: true,
        [$.UL]: true,
        [$.VAR]: true
    };

    //Check exit from foreign content
    exports.causesExit = function(startTagToken) {
        const tn = startTagToken.tagName;
        const isFontWithAttrs =
            tn === $.FONT &&
            (tokenizer.getTokenAttr(startTagToken, ATTRS.COLOR) !== null ||
                tokenizer.getTokenAttr(startTagToken, ATTRS.SIZE) !== null ||
                tokenizer.getTokenAttr(startTagToken, ATTRS.FACE) !== null);

        return isFontWithAttrs ? true : EXITS_FOREIGN_CONTENT[tn];
    };

    //Token adjustments
    exports.adjustTokenMathMLAttrs = function(token) {
        for (let i = 0; i < token.attrs.length; i++) {
            if (token.attrs[i].name === DEFINITION_URL_ATTR) {
                token.attrs[i].name = ADJUSTED_DEFINITION_URL_ATTR;
                break;
            }
        }
    };

    exports.adjustTokenSVGAttrs = function(token) {
        for (let i = 0; i < token.attrs.length; i++) {
            const adjustedAttrName = SVG_ATTRS_ADJUSTMENT_MAP[token.attrs[i].name];

            if (adjustedAttrName) {
                token.attrs[i].name = adjustedAttrName;
            }
        }
    };

    exports.adjustTokenXMLAttrs = function(token) {
        for (let i = 0; i < token.attrs.length; i++) {
            const adjustedAttrEntry = XML_ATTRS_ADJUSTMENT_MAP[token.attrs[i].name];

            if (adjustedAttrEntry) {
                token.attrs[i].prefix = adjustedAttrEntry.prefix;
                token.attrs[i].name = adjustedAttrEntry.name;
                token.attrs[i].namespace = adjustedAttrEntry.namespace;
            }
        }
    };

    exports.adjustTokenSVGTagName = function(token) {
        const adjustedTagName = SVG_TAG_NAMES_ADJUSTMENT_MAP[token.tagName];

        if (adjustedTagName) {
            token.tagName = adjustedTagName;
        }
    };

    //Integration points
    function isMathMLTextIntegrationPoint(tn, ns) {
        return ns === NS.MATHML && (tn === $.MI || tn === $.MO || tn === $.MN || tn === $.MS || tn === $.MTEXT);
    }

    function isHtmlIntegrationPoint(tn, ns, attrs) {
        if (ns === NS.MATHML && tn === $.ANNOTATION_XML) {
            for (let i = 0; i < attrs.length; i++) {
                if (attrs[i].name === ATTRS.ENCODING) {
                    const value = attrs[i].value.toLowerCase();

                    return value === MIME_TYPES.TEXT_HTML || value === MIME_TYPES.APPLICATION_XML;
                }
            }
        }

        return ns === NS.SVG && (tn === $.FOREIGN_OBJECT || tn === $.DESC || tn === $.TITLE);
    }

    exports.isIntegrationPoint = function(tn, ns, attrs, foreignNS) {
        if ((!foreignNS || foreignNS === NS.HTML) && isHtmlIntegrationPoint(tn, ns, attrs)) {
            return true;
        }

        if ((!foreignNS || foreignNS === NS.MATHML) && isMathMLTextIntegrationPoint(tn, ns)) {
            return true;
        }

        return false;
    };
    });

    //Aliases
    const $$4 = html$1.TAG_NAMES;
    const NS$1 = html$1.NAMESPACES;
    const ATTRS = html$1.ATTRS;

    const DEFAULT_OPTIONS = {
        scriptingEnabled: true,
        sourceCodeLocationInfo: false,
        onParseError: null,
        treeAdapter: _default
    };

    //Misc constants
    const HIDDEN_INPUT_TYPE = 'hidden';

    //Adoption agency loops iteration count
    const AA_OUTER_LOOP_ITER = 8;
    const AA_INNER_LOOP_ITER = 3;

    //Insertion modes
    const INITIAL_MODE = 'INITIAL_MODE';
    const BEFORE_HTML_MODE = 'BEFORE_HTML_MODE';
    const BEFORE_HEAD_MODE = 'BEFORE_HEAD_MODE';
    const IN_HEAD_MODE = 'IN_HEAD_MODE';
    const IN_HEAD_NO_SCRIPT_MODE = 'IN_HEAD_NO_SCRIPT_MODE';
    const AFTER_HEAD_MODE = 'AFTER_HEAD_MODE';
    const IN_BODY_MODE = 'IN_BODY_MODE';
    const TEXT_MODE = 'TEXT_MODE';
    const IN_TABLE_MODE = 'IN_TABLE_MODE';
    const IN_TABLE_TEXT_MODE = 'IN_TABLE_TEXT_MODE';
    const IN_CAPTION_MODE = 'IN_CAPTION_MODE';
    const IN_COLUMN_GROUP_MODE = 'IN_COLUMN_GROUP_MODE';
    const IN_TABLE_BODY_MODE = 'IN_TABLE_BODY_MODE';
    const IN_ROW_MODE = 'IN_ROW_MODE';
    const IN_CELL_MODE = 'IN_CELL_MODE';
    const IN_SELECT_MODE = 'IN_SELECT_MODE';
    const IN_SELECT_IN_TABLE_MODE = 'IN_SELECT_IN_TABLE_MODE';
    const IN_TEMPLATE_MODE = 'IN_TEMPLATE_MODE';
    const AFTER_BODY_MODE = 'AFTER_BODY_MODE';
    const IN_FRAMESET_MODE = 'IN_FRAMESET_MODE';
    const AFTER_FRAMESET_MODE = 'AFTER_FRAMESET_MODE';
    const AFTER_AFTER_BODY_MODE = 'AFTER_AFTER_BODY_MODE';
    const AFTER_AFTER_FRAMESET_MODE = 'AFTER_AFTER_FRAMESET_MODE';

    //Insertion mode reset map
    const INSERTION_MODE_RESET_MAP = {
        [$$4.TR]: IN_ROW_MODE,
        [$$4.TBODY]: IN_TABLE_BODY_MODE,
        [$$4.THEAD]: IN_TABLE_BODY_MODE,
        [$$4.TFOOT]: IN_TABLE_BODY_MODE,
        [$$4.CAPTION]: IN_CAPTION_MODE,
        [$$4.COLGROUP]: IN_COLUMN_GROUP_MODE,
        [$$4.TABLE]: IN_TABLE_MODE,
        [$$4.BODY]: IN_BODY_MODE,
        [$$4.FRAMESET]: IN_FRAMESET_MODE
    };

    //Template insertion mode switch map
    const TEMPLATE_INSERTION_MODE_SWITCH_MAP = {
        [$$4.CAPTION]: IN_TABLE_MODE,
        [$$4.COLGROUP]: IN_TABLE_MODE,
        [$$4.TBODY]: IN_TABLE_MODE,
        [$$4.TFOOT]: IN_TABLE_MODE,
        [$$4.THEAD]: IN_TABLE_MODE,
        [$$4.COL]: IN_COLUMN_GROUP_MODE,
        [$$4.TR]: IN_TABLE_BODY_MODE,
        [$$4.TD]: IN_ROW_MODE,
        [$$4.TH]: IN_ROW_MODE
    };

    //Token handlers map for insertion modes
    const TOKEN_HANDLERS = {
        [INITIAL_MODE]: {
            [tokenizer.CHARACTER_TOKEN]: tokenInInitialMode,
            [tokenizer.NULL_CHARACTER_TOKEN]: tokenInInitialMode,
            [tokenizer.WHITESPACE_CHARACTER_TOKEN]: ignoreToken,
            [tokenizer.COMMENT_TOKEN]: appendComment,
            [tokenizer.DOCTYPE_TOKEN]: doctypeInInitialMode,
            [tokenizer.START_TAG_TOKEN]: tokenInInitialMode,
            [tokenizer.END_TAG_TOKEN]: tokenInInitialMode,
            [tokenizer.EOF_TOKEN]: tokenInInitialMode
        },
        [BEFORE_HTML_MODE]: {
            [tokenizer.CHARACTER_TOKEN]: tokenBeforeHtml,
            [tokenizer.NULL_CHARACTER_TOKEN]: tokenBeforeHtml,
            [tokenizer.WHITESPACE_CHARACTER_TOKEN]: ignoreToken,
            [tokenizer.COMMENT_TOKEN]: appendComment,
            [tokenizer.DOCTYPE_TOKEN]: ignoreToken,
            [tokenizer.START_TAG_TOKEN]: startTagBeforeHtml,
            [tokenizer.END_TAG_TOKEN]: endTagBeforeHtml,
            [tokenizer.EOF_TOKEN]: tokenBeforeHtml
        },
        [BEFORE_HEAD_MODE]: {
            [tokenizer.CHARACTER_TOKEN]: tokenBeforeHead,
            [tokenizer.NULL_CHARACTER_TOKEN]: tokenBeforeHead,
            [tokenizer.WHITESPACE_CHARACTER_TOKEN]: ignoreToken,
            [tokenizer.COMMENT_TOKEN]: appendComment,
            [tokenizer.DOCTYPE_TOKEN]: misplacedDoctype,
            [tokenizer.START_TAG_TOKEN]: startTagBeforeHead,
            [tokenizer.END_TAG_TOKEN]: endTagBeforeHead,
            [tokenizer.EOF_TOKEN]: tokenBeforeHead
        },
        [IN_HEAD_MODE]: {
            [tokenizer.CHARACTER_TOKEN]: tokenInHead,
            [tokenizer.NULL_CHARACTER_TOKEN]: tokenInHead,
            [tokenizer.WHITESPACE_CHARACTER_TOKEN]: insertCharacters,
            [tokenizer.COMMENT_TOKEN]: appendComment,
            [tokenizer.DOCTYPE_TOKEN]: misplacedDoctype,
            [tokenizer.START_TAG_TOKEN]: startTagInHead,
            [tokenizer.END_TAG_TOKEN]: endTagInHead,
            [tokenizer.EOF_TOKEN]: tokenInHead
        },
        [IN_HEAD_NO_SCRIPT_MODE]: {
            [tokenizer.CHARACTER_TOKEN]: tokenInHeadNoScript,
            [tokenizer.NULL_CHARACTER_TOKEN]: tokenInHeadNoScript,
            [tokenizer.WHITESPACE_CHARACTER_TOKEN]: insertCharacters,
            [tokenizer.COMMENT_TOKEN]: appendComment,
            [tokenizer.DOCTYPE_TOKEN]: misplacedDoctype,
            [tokenizer.START_TAG_TOKEN]: startTagInHeadNoScript,
            [tokenizer.END_TAG_TOKEN]: endTagInHeadNoScript,
            [tokenizer.EOF_TOKEN]: tokenInHeadNoScript
        },
        [AFTER_HEAD_MODE]: {
            [tokenizer.CHARACTER_TOKEN]: tokenAfterHead,
            [tokenizer.NULL_CHARACTER_TOKEN]: tokenAfterHead,
            [tokenizer.WHITESPACE_CHARACTER_TOKEN]: insertCharacters,
            [tokenizer.COMMENT_TOKEN]: appendComment,
            [tokenizer.DOCTYPE_TOKEN]: misplacedDoctype,
            [tokenizer.START_TAG_TOKEN]: startTagAfterHead,
            [tokenizer.END_TAG_TOKEN]: endTagAfterHead,
            [tokenizer.EOF_TOKEN]: tokenAfterHead
        },
        [IN_BODY_MODE]: {
            [tokenizer.CHARACTER_TOKEN]: characterInBody,
            [tokenizer.NULL_CHARACTER_TOKEN]: ignoreToken,
            [tokenizer.WHITESPACE_CHARACTER_TOKEN]: whitespaceCharacterInBody,
            [tokenizer.COMMENT_TOKEN]: appendComment,
            [tokenizer.DOCTYPE_TOKEN]: ignoreToken,
            [tokenizer.START_TAG_TOKEN]: startTagInBody,
            [tokenizer.END_TAG_TOKEN]: endTagInBody,
            [tokenizer.EOF_TOKEN]: eofInBody
        },
        [TEXT_MODE]: {
            [tokenizer.CHARACTER_TOKEN]: insertCharacters,
            [tokenizer.NULL_CHARACTER_TOKEN]: insertCharacters,
            [tokenizer.WHITESPACE_CHARACTER_TOKEN]: insertCharacters,
            [tokenizer.COMMENT_TOKEN]: ignoreToken,
            [tokenizer.DOCTYPE_TOKEN]: ignoreToken,
            [tokenizer.START_TAG_TOKEN]: ignoreToken,
            [tokenizer.END_TAG_TOKEN]: endTagInText,
            [tokenizer.EOF_TOKEN]: eofInText
        },
        [IN_TABLE_MODE]: {
            [tokenizer.CHARACTER_TOKEN]: characterInTable,
            [tokenizer.NULL_CHARACTER_TOKEN]: characterInTable,
            [tokenizer.WHITESPACE_CHARACTER_TOKEN]: characterInTable,
            [tokenizer.COMMENT_TOKEN]: appendComment,
            [tokenizer.DOCTYPE_TOKEN]: ignoreToken,
            [tokenizer.START_TAG_TOKEN]: startTagInTable,
            [tokenizer.END_TAG_TOKEN]: endTagInTable,
            [tokenizer.EOF_TOKEN]: eofInBody
        },
        [IN_TABLE_TEXT_MODE]: {
            [tokenizer.CHARACTER_TOKEN]: characterInTableText,
            [tokenizer.NULL_CHARACTER_TOKEN]: ignoreToken,
            [tokenizer.WHITESPACE_CHARACTER_TOKEN]: whitespaceCharacterInTableText,
            [tokenizer.COMMENT_TOKEN]: tokenInTableText,
            [tokenizer.DOCTYPE_TOKEN]: tokenInTableText,
            [tokenizer.START_TAG_TOKEN]: tokenInTableText,
            [tokenizer.END_TAG_TOKEN]: tokenInTableText,
            [tokenizer.EOF_TOKEN]: tokenInTableText
        },
        [IN_CAPTION_MODE]: {
            [tokenizer.CHARACTER_TOKEN]: characterInBody,
            [tokenizer.NULL_CHARACTER_TOKEN]: ignoreToken,
            [tokenizer.WHITESPACE_CHARACTER_TOKEN]: whitespaceCharacterInBody,
            [tokenizer.COMMENT_TOKEN]: appendComment,
            [tokenizer.DOCTYPE_TOKEN]: ignoreToken,
            [tokenizer.START_TAG_TOKEN]: startTagInCaption,
            [tokenizer.END_TAG_TOKEN]: endTagInCaption,
            [tokenizer.EOF_TOKEN]: eofInBody
        },
        [IN_COLUMN_GROUP_MODE]: {
            [tokenizer.CHARACTER_TOKEN]: tokenInColumnGroup,
            [tokenizer.NULL_CHARACTER_TOKEN]: tokenInColumnGroup,
            [tokenizer.WHITESPACE_CHARACTER_TOKEN]: insertCharacters,
            [tokenizer.COMMENT_TOKEN]: appendComment,
            [tokenizer.DOCTYPE_TOKEN]: ignoreToken,
            [tokenizer.START_TAG_TOKEN]: startTagInColumnGroup,
            [tokenizer.END_TAG_TOKEN]: endTagInColumnGroup,
            [tokenizer.EOF_TOKEN]: eofInBody
        },
        [IN_TABLE_BODY_MODE]: {
            [tokenizer.CHARACTER_TOKEN]: characterInTable,
            [tokenizer.NULL_CHARACTER_TOKEN]: characterInTable,
            [tokenizer.WHITESPACE_CHARACTER_TOKEN]: characterInTable,
            [tokenizer.COMMENT_TOKEN]: appendComment,
            [tokenizer.DOCTYPE_TOKEN]: ignoreToken,
            [tokenizer.START_TAG_TOKEN]: startTagInTableBody,
            [tokenizer.END_TAG_TOKEN]: endTagInTableBody,
            [tokenizer.EOF_TOKEN]: eofInBody
        },
        [IN_ROW_MODE]: {
            [tokenizer.CHARACTER_TOKEN]: characterInTable,
            [tokenizer.NULL_CHARACTER_TOKEN]: characterInTable,
            [tokenizer.WHITESPACE_CHARACTER_TOKEN]: characterInTable,
            [tokenizer.COMMENT_TOKEN]: appendComment,
            [tokenizer.DOCTYPE_TOKEN]: ignoreToken,
            [tokenizer.START_TAG_TOKEN]: startTagInRow,
            [tokenizer.END_TAG_TOKEN]: endTagInRow,
            [tokenizer.EOF_TOKEN]: eofInBody
        },
        [IN_CELL_MODE]: {
            [tokenizer.CHARACTER_TOKEN]: characterInBody,
            [tokenizer.NULL_CHARACTER_TOKEN]: ignoreToken,
            [tokenizer.WHITESPACE_CHARACTER_TOKEN]: whitespaceCharacterInBody,
            [tokenizer.COMMENT_TOKEN]: appendComment,
            [tokenizer.DOCTYPE_TOKEN]: ignoreToken,
            [tokenizer.START_TAG_TOKEN]: startTagInCell,
            [tokenizer.END_TAG_TOKEN]: endTagInCell,
            [tokenizer.EOF_TOKEN]: eofInBody
        },
        [IN_SELECT_MODE]: {
            [tokenizer.CHARACTER_TOKEN]: insertCharacters,
            [tokenizer.NULL_CHARACTER_TOKEN]: ignoreToken,
            [tokenizer.WHITESPACE_CHARACTER_TOKEN]: insertCharacters,
            [tokenizer.COMMENT_TOKEN]: appendComment,
            [tokenizer.DOCTYPE_TOKEN]: ignoreToken,
            [tokenizer.START_TAG_TOKEN]: startTagInSelect,
            [tokenizer.END_TAG_TOKEN]: endTagInSelect,
            [tokenizer.EOF_TOKEN]: eofInBody
        },
        [IN_SELECT_IN_TABLE_MODE]: {
            [tokenizer.CHARACTER_TOKEN]: insertCharacters,
            [tokenizer.NULL_CHARACTER_TOKEN]: ignoreToken,
            [tokenizer.WHITESPACE_CHARACTER_TOKEN]: insertCharacters,
            [tokenizer.COMMENT_TOKEN]: appendComment,
            [tokenizer.DOCTYPE_TOKEN]: ignoreToken,
            [tokenizer.START_TAG_TOKEN]: startTagInSelectInTable,
            [tokenizer.END_TAG_TOKEN]: endTagInSelectInTable,
            [tokenizer.EOF_TOKEN]: eofInBody
        },
        [IN_TEMPLATE_MODE]: {
            [tokenizer.CHARACTER_TOKEN]: characterInBody,
            [tokenizer.NULL_CHARACTER_TOKEN]: ignoreToken,
            [tokenizer.WHITESPACE_CHARACTER_TOKEN]: whitespaceCharacterInBody,
            [tokenizer.COMMENT_TOKEN]: appendComment,
            [tokenizer.DOCTYPE_TOKEN]: ignoreToken,
            [tokenizer.START_TAG_TOKEN]: startTagInTemplate,
            [tokenizer.END_TAG_TOKEN]: endTagInTemplate,
            [tokenizer.EOF_TOKEN]: eofInTemplate
        },
        [AFTER_BODY_MODE]: {
            [tokenizer.CHARACTER_TOKEN]: tokenAfterBody,
            [tokenizer.NULL_CHARACTER_TOKEN]: tokenAfterBody,
            [tokenizer.WHITESPACE_CHARACTER_TOKEN]: whitespaceCharacterInBody,
            [tokenizer.COMMENT_TOKEN]: appendCommentToRootHtmlElement,
            [tokenizer.DOCTYPE_TOKEN]: ignoreToken,
            [tokenizer.START_TAG_TOKEN]: startTagAfterBody,
            [tokenizer.END_TAG_TOKEN]: endTagAfterBody,
            [tokenizer.EOF_TOKEN]: stopParsing
        },
        [IN_FRAMESET_MODE]: {
            [tokenizer.CHARACTER_TOKEN]: ignoreToken,
            [tokenizer.NULL_CHARACTER_TOKEN]: ignoreToken,
            [tokenizer.WHITESPACE_CHARACTER_TOKEN]: insertCharacters,
            [tokenizer.COMMENT_TOKEN]: appendComment,
            [tokenizer.DOCTYPE_TOKEN]: ignoreToken,
            [tokenizer.START_TAG_TOKEN]: startTagInFrameset,
            [tokenizer.END_TAG_TOKEN]: endTagInFrameset,
            [tokenizer.EOF_TOKEN]: stopParsing
        },
        [AFTER_FRAMESET_MODE]: {
            [tokenizer.CHARACTER_TOKEN]: ignoreToken,
            [tokenizer.NULL_CHARACTER_TOKEN]: ignoreToken,
            [tokenizer.WHITESPACE_CHARACTER_TOKEN]: insertCharacters,
            [tokenizer.COMMENT_TOKEN]: appendComment,
            [tokenizer.DOCTYPE_TOKEN]: ignoreToken,
            [tokenizer.START_TAG_TOKEN]: startTagAfterFrameset,
            [tokenizer.END_TAG_TOKEN]: endTagAfterFrameset,
            [tokenizer.EOF_TOKEN]: stopParsing
        },
        [AFTER_AFTER_BODY_MODE]: {
            [tokenizer.CHARACTER_TOKEN]: tokenAfterAfterBody,
            [tokenizer.NULL_CHARACTER_TOKEN]: tokenAfterAfterBody,
            [tokenizer.WHITESPACE_CHARACTER_TOKEN]: whitespaceCharacterInBody,
            [tokenizer.COMMENT_TOKEN]: appendCommentToDocument,
            [tokenizer.DOCTYPE_TOKEN]: ignoreToken,
            [tokenizer.START_TAG_TOKEN]: startTagAfterAfterBody,
            [tokenizer.END_TAG_TOKEN]: tokenAfterAfterBody,
            [tokenizer.EOF_TOKEN]: stopParsing
        },
        [AFTER_AFTER_FRAMESET_MODE]: {
            [tokenizer.CHARACTER_TOKEN]: ignoreToken,
            [tokenizer.NULL_CHARACTER_TOKEN]: ignoreToken,
            [tokenizer.WHITESPACE_CHARACTER_TOKEN]: whitespaceCharacterInBody,
            [tokenizer.COMMENT_TOKEN]: appendCommentToDocument,
            [tokenizer.DOCTYPE_TOKEN]: ignoreToken,
            [tokenizer.START_TAG_TOKEN]: startTagAfterAfterFrameset,
            [tokenizer.END_TAG_TOKEN]: ignoreToken,
            [tokenizer.EOF_TOKEN]: stopParsing
        }
    };

    //Parser
    class Parser {
        constructor(options) {
            this.options = mergeOptions(DEFAULT_OPTIONS, options);

            this.treeAdapter = this.options.treeAdapter;
            this.pendingScript = null;

            if (this.options.sourceCodeLocationInfo) {
                mixin.install(this, parserMixin);
            }

            if (this.options.onParseError) {
                mixin.install(this, parserMixin$1, { onParseError: this.options.onParseError });
            }
        }

        // API
        parse(html) {
            const document = this.treeAdapter.createDocument();

            this._bootstrap(document, null);
            this.tokenizer.write(html, true);
            this._runParsingLoop(null);

            return document;
        }

        parseFragment(html, fragmentContext) {
            //NOTE: use <template> element as a fragment context if context element was not provided,
            //so we will parse in "forgiving" manner
            if (!fragmentContext) {
                fragmentContext = this.treeAdapter.createElement($$4.TEMPLATE, NS$1.HTML, []);
            }

            //NOTE: create fake element which will be used as 'document' for fragment parsing.
            //This is important for jsdom there 'document' can't be recreated, therefore
            //fragment parsing causes messing of the main `document`.
            const documentMock = this.treeAdapter.createElement('documentmock', NS$1.HTML, []);

            this._bootstrap(documentMock, fragmentContext);

            if (this.treeAdapter.getTagName(fragmentContext) === $$4.TEMPLATE) {
                this._pushTmplInsertionMode(IN_TEMPLATE_MODE);
            }

            this._initTokenizerForFragmentParsing();
            this._insertFakeRootElement();
            this._resetInsertionMode();
            this._findFormInFragmentContext();
            this.tokenizer.write(html, true);
            this._runParsingLoop(null);

            const rootElement = this.treeAdapter.getFirstChild(documentMock);
            const fragment = this.treeAdapter.createDocumentFragment();

            this._adoptNodes(rootElement, fragment);

            return fragment;
        }

        //Bootstrap parser
        _bootstrap(document, fragmentContext) {
            this.tokenizer = new tokenizer(this.options);

            this.stopped = false;

            this.insertionMode = INITIAL_MODE;
            this.originalInsertionMode = '';

            this.document = document;
            this.fragmentContext = fragmentContext;

            this.headElement = null;
            this.formElement = null;

            this.openElements = new openElementStack(this.document, this.treeAdapter);
            this.activeFormattingElements = new formattingElementList(this.treeAdapter);

            this.tmplInsertionModeStack = [];
            this.tmplInsertionModeStackTop = -1;
            this.currentTmplInsertionMode = null;

            this.pendingCharacterTokens = [];
            this.hasNonWhitespacePendingCharacterToken = false;

            this.framesetOk = true;
            this.skipNextNewLine = false;
            this.fosterParentingEnabled = false;
        }

        //Errors
        _err() {
            // NOTE: err reporting is noop by default. Enabled by mixin.
        }

        //Parsing loop
        _runParsingLoop(scriptHandler) {
            while (!this.stopped) {
                this._setupTokenizerCDATAMode();

                const token = this.tokenizer.getNextToken();

                if (token.type === tokenizer.HIBERNATION_TOKEN) {
                    break;
                }

                if (this.skipNextNewLine) {
                    this.skipNextNewLine = false;

                    if (token.type === tokenizer.WHITESPACE_CHARACTER_TOKEN && token.chars[0] === '\n') {
                        if (token.chars.length === 1) {
                            continue;
                        }

                        token.chars = token.chars.substr(1);
                    }
                }

                this._processInputToken(token);

                if (scriptHandler && this.pendingScript) {
                    break;
                }
            }
        }

        runParsingLoopForCurrentChunk(writeCallback, scriptHandler) {
            this._runParsingLoop(scriptHandler);

            if (scriptHandler && this.pendingScript) {
                const script = this.pendingScript;

                this.pendingScript = null;

                scriptHandler(script);

                return;
            }

            if (writeCallback) {
                writeCallback();
            }
        }

        //Text parsing
        _setupTokenizerCDATAMode() {
            const current = this._getAdjustedCurrentElement();

            this.tokenizer.allowCDATA =
                current &&
                current !== this.document &&
                this.treeAdapter.getNamespaceURI(current) !== NS$1.HTML &&
                !this._isIntegrationPoint(current);
        }

        _switchToTextParsing(currentToken, nextTokenizerState) {
            this._insertElement(currentToken, NS$1.HTML);
            this.tokenizer.state = nextTokenizerState;
            this.originalInsertionMode = this.insertionMode;
            this.insertionMode = TEXT_MODE;
        }

        switchToPlaintextParsing() {
            this.insertionMode = TEXT_MODE;
            this.originalInsertionMode = IN_BODY_MODE;
            this.tokenizer.state = tokenizer.MODE.PLAINTEXT;
        }

        //Fragment parsing
        _getAdjustedCurrentElement() {
            return this.openElements.stackTop === 0 && this.fragmentContext
                ? this.fragmentContext
                : this.openElements.current;
        }

        _findFormInFragmentContext() {
            let node = this.fragmentContext;

            do {
                if (this.treeAdapter.getTagName(node) === $$4.FORM) {
                    this.formElement = node;
                    break;
                }

                node = this.treeAdapter.getParentNode(node);
            } while (node);
        }

        _initTokenizerForFragmentParsing() {
            if (this.treeAdapter.getNamespaceURI(this.fragmentContext) === NS$1.HTML) {
                const tn = this.treeAdapter.getTagName(this.fragmentContext);

                if (tn === $$4.TITLE || tn === $$4.TEXTAREA) {
                    this.tokenizer.state = tokenizer.MODE.RCDATA;
                } else if (
                    tn === $$4.STYLE ||
                    tn === $$4.XMP ||
                    tn === $$4.IFRAME ||
                    tn === $$4.NOEMBED ||
                    tn === $$4.NOFRAMES ||
                    tn === $$4.NOSCRIPT
                ) {
                    this.tokenizer.state = tokenizer.MODE.RAWTEXT;
                } else if (tn === $$4.SCRIPT) {
                    this.tokenizer.state = tokenizer.MODE.SCRIPT_DATA;
                } else if (tn === $$4.PLAINTEXT) {
                    this.tokenizer.state = tokenizer.MODE.PLAINTEXT;
                }
            }
        }

        //Tree mutation
        _setDocumentType(token) {
            const name = token.name || '';
            const publicId = token.publicId || '';
            const systemId = token.systemId || '';

            this.treeAdapter.setDocumentType(this.document, name, publicId, systemId);
        }

        _attachElementToTree(element) {
            if (this._shouldFosterParentOnInsertion()) {
                this._fosterParentElement(element);
            } else {
                const parent = this.openElements.currentTmplContent || this.openElements.current;

                this.treeAdapter.appendChild(parent, element);
            }
        }

        _appendElement(token, namespaceURI) {
            const element = this.treeAdapter.createElement(token.tagName, namespaceURI, token.attrs);

            this._attachElementToTree(element);
        }

        _insertElement(token, namespaceURI) {
            const element = this.treeAdapter.createElement(token.tagName, namespaceURI, token.attrs);

            this._attachElementToTree(element);
            this.openElements.push(element);
        }

        _insertFakeElement(tagName) {
            const element = this.treeAdapter.createElement(tagName, NS$1.HTML, []);

            this._attachElementToTree(element);
            this.openElements.push(element);
        }

        _insertTemplate(token) {
            const tmpl = this.treeAdapter.createElement(token.tagName, NS$1.HTML, token.attrs);
            const content = this.treeAdapter.createDocumentFragment();

            this.treeAdapter.setTemplateContent(tmpl, content);
            this._attachElementToTree(tmpl);
            this.openElements.push(tmpl);
        }

        _insertFakeRootElement() {
            const element = this.treeAdapter.createElement($$4.HTML, NS$1.HTML, []);

            this.treeAdapter.appendChild(this.openElements.current, element);
            this.openElements.push(element);
        }

        _appendCommentNode(token, parent) {
            const commentNode = this.treeAdapter.createCommentNode(token.data);

            this.treeAdapter.appendChild(parent, commentNode);
        }

        _insertCharacters(token) {
            if (this._shouldFosterParentOnInsertion()) {
                this._fosterParentText(token.chars);
            } else {
                const parent = this.openElements.currentTmplContent || this.openElements.current;

                this.treeAdapter.insertText(parent, token.chars);
            }
        }

        _adoptNodes(donor, recipient) {
            for (let child = this.treeAdapter.getFirstChild(donor); child; child = this.treeAdapter.getFirstChild(donor)) {
                this.treeAdapter.detachNode(child);
                this.treeAdapter.appendChild(recipient, child);
            }
        }

        //Token processing
        _shouldProcessTokenInForeignContent(token) {
            const current = this._getAdjustedCurrentElement();

            if (!current || current === this.document) {
                return false;
            }

            const ns = this.treeAdapter.getNamespaceURI(current);

            if (ns === NS$1.HTML) {
                return false;
            }

            if (
                this.treeAdapter.getTagName(current) === $$4.ANNOTATION_XML &&
                ns === NS$1.MATHML &&
                token.type === tokenizer.START_TAG_TOKEN &&
                token.tagName === $$4.SVG
            ) {
                return false;
            }

            const isCharacterToken =
                token.type === tokenizer.CHARACTER_TOKEN ||
                token.type === tokenizer.NULL_CHARACTER_TOKEN ||
                token.type === tokenizer.WHITESPACE_CHARACTER_TOKEN;

            const isMathMLTextStartTag =
                token.type === tokenizer.START_TAG_TOKEN && token.tagName !== $$4.MGLYPH && token.tagName !== $$4.MALIGNMARK;

            if ((isMathMLTextStartTag || isCharacterToken) && this._isIntegrationPoint(current, NS$1.MATHML)) {
                return false;
            }

            if (
                (token.type === tokenizer.START_TAG_TOKEN || isCharacterToken) &&
                this._isIntegrationPoint(current, NS$1.HTML)
            ) {
                return false;
            }

            return token.type !== tokenizer.EOF_TOKEN;
        }

        _processToken(token) {
            TOKEN_HANDLERS[this.insertionMode][token.type](this, token);
        }

        _processTokenInBodyMode(token) {
            TOKEN_HANDLERS[IN_BODY_MODE][token.type](this, token);
        }

        _processTokenInForeignContent(token) {
            if (token.type === tokenizer.CHARACTER_TOKEN) {
                characterInForeignContent(this, token);
            } else if (token.type === tokenizer.NULL_CHARACTER_TOKEN) {
                nullCharacterInForeignContent(this, token);
            } else if (token.type === tokenizer.WHITESPACE_CHARACTER_TOKEN) {
                insertCharacters(this, token);
            } else if (token.type === tokenizer.COMMENT_TOKEN) {
                appendComment(this, token);
            } else if (token.type === tokenizer.START_TAG_TOKEN) {
                startTagInForeignContent(this, token);
            } else if (token.type === tokenizer.END_TAG_TOKEN) {
                endTagInForeignContent(this, token);
            }
        }

        _processInputToken(token) {
            if (this._shouldProcessTokenInForeignContent(token)) {
                this._processTokenInForeignContent(token);
            } else {
                this._processToken(token);
            }

            if (token.type === tokenizer.START_TAG_TOKEN && token.selfClosing && !token.ackSelfClosing) {
                this._err(errorCodes.nonVoidHtmlElementStartTagWithTrailingSolidus);
            }
        }

        //Integration points
        _isIntegrationPoint(element, foreignNS) {
            const tn = this.treeAdapter.getTagName(element);
            const ns = this.treeAdapter.getNamespaceURI(element);
            const attrs = this.treeAdapter.getAttrList(element);

            return foreignContent.isIntegrationPoint(tn, ns, attrs, foreignNS);
        }

        //Active formatting elements reconstruction
        _reconstructActiveFormattingElements() {
            const listLength = this.activeFormattingElements.length;

            if (listLength) {
                let unopenIdx = listLength;
                let entry = null;

                do {
                    unopenIdx--;
                    entry = this.activeFormattingElements.entries[unopenIdx];

                    if (entry.type === formattingElementList.MARKER_ENTRY || this.openElements.contains(entry.element)) {
                        unopenIdx++;
                        break;
                    }
                } while (unopenIdx > 0);

                for (let i = unopenIdx; i < listLength; i++) {
                    entry = this.activeFormattingElements.entries[i];
                    this._insertElement(entry.token, this.treeAdapter.getNamespaceURI(entry.element));
                    entry.element = this.openElements.current;
                }
            }
        }

        //Close elements
        _closeTableCell() {
            this.openElements.generateImpliedEndTags();
            this.openElements.popUntilTableCellPopped();
            this.activeFormattingElements.clearToLastMarker();
            this.insertionMode = IN_ROW_MODE;
        }

        _closePElement() {
            this.openElements.generateImpliedEndTagsWithExclusion($$4.P);
            this.openElements.popUntilTagNamePopped($$4.P);
        }

        //Insertion modes
        _resetInsertionMode() {
            for (let i = this.openElements.stackTop, last = false; i >= 0; i--) {
                let element = this.openElements.items[i];

                if (i === 0) {
                    last = true;

                    if (this.fragmentContext) {
                        element = this.fragmentContext;
                    }
                }

                const tn = this.treeAdapter.getTagName(element);
                const newInsertionMode = INSERTION_MODE_RESET_MAP[tn];

                if (newInsertionMode) {
                    this.insertionMode = newInsertionMode;
                    break;
                } else if (!last && (tn === $$4.TD || tn === $$4.TH)) {
                    this.insertionMode = IN_CELL_MODE;
                    break;
                } else if (!last && tn === $$4.HEAD) {
                    this.insertionMode = IN_HEAD_MODE;
                    break;
                } else if (tn === $$4.SELECT) {
                    this._resetInsertionModeForSelect(i);
                    break;
                } else if (tn === $$4.TEMPLATE) {
                    this.insertionMode = this.currentTmplInsertionMode;
                    break;
                } else if (tn === $$4.HTML) {
                    this.insertionMode = this.headElement ? AFTER_HEAD_MODE : BEFORE_HEAD_MODE;
                    break;
                } else if (last) {
                    this.insertionMode = IN_BODY_MODE;
                    break;
                }
            }
        }

        _resetInsertionModeForSelect(selectIdx) {
            if (selectIdx > 0) {
                for (let i = selectIdx - 1; i > 0; i--) {
                    const ancestor = this.openElements.items[i];
                    const tn = this.treeAdapter.getTagName(ancestor);

                    if (tn === $$4.TEMPLATE) {
                        break;
                    } else if (tn === $$4.TABLE) {
                        this.insertionMode = IN_SELECT_IN_TABLE_MODE;
                        return;
                    }
                }
            }

            this.insertionMode = IN_SELECT_MODE;
        }

        _pushTmplInsertionMode(mode) {
            this.tmplInsertionModeStack.push(mode);
            this.tmplInsertionModeStackTop++;
            this.currentTmplInsertionMode = mode;
        }

        _popTmplInsertionMode() {
            this.tmplInsertionModeStack.pop();
            this.tmplInsertionModeStackTop--;
            this.currentTmplInsertionMode = this.tmplInsertionModeStack[this.tmplInsertionModeStackTop];
        }

        //Foster parenting
        _isElementCausesFosterParenting(element) {
            const tn = this.treeAdapter.getTagName(element);

            return tn === $$4.TABLE || tn === $$4.TBODY || tn === $$4.TFOOT || tn === $$4.THEAD || tn === $$4.TR;
        }

        _shouldFosterParentOnInsertion() {
            return this.fosterParentingEnabled && this._isElementCausesFosterParenting(this.openElements.current);
        }

        _findFosterParentingLocation() {
            const location = {
                parent: null,
                beforeElement: null
            };

            for (let i = this.openElements.stackTop; i >= 0; i--) {
                const openElement = this.openElements.items[i];
                const tn = this.treeAdapter.getTagName(openElement);
                const ns = this.treeAdapter.getNamespaceURI(openElement);

                if (tn === $$4.TEMPLATE && ns === NS$1.HTML) {
                    location.parent = this.treeAdapter.getTemplateContent(openElement);
                    break;
                } else if (tn === $$4.TABLE) {
                    location.parent = this.treeAdapter.getParentNode(openElement);

                    if (location.parent) {
                        location.beforeElement = openElement;
                    } else {
                        location.parent = this.openElements.items[i - 1];
                    }

                    break;
                }
            }

            if (!location.parent) {
                location.parent = this.openElements.items[0];
            }

            return location;
        }

        _fosterParentElement(element) {
            const location = this._findFosterParentingLocation();

            if (location.beforeElement) {
                this.treeAdapter.insertBefore(location.parent, element, location.beforeElement);
            } else {
                this.treeAdapter.appendChild(location.parent, element);
            }
        }

        _fosterParentText(chars) {
            const location = this._findFosterParentingLocation();

            if (location.beforeElement) {
                this.treeAdapter.insertTextBefore(location.parent, chars, location.beforeElement);
            } else {
                this.treeAdapter.insertText(location.parent, chars);
            }
        }

        //Special elements
        _isSpecialElement(element) {
            const tn = this.treeAdapter.getTagName(element);
            const ns = this.treeAdapter.getNamespaceURI(element);

            return html$1.SPECIAL_ELEMENTS[ns][tn];
        }
    }

    var parser = Parser;

    //Adoption agency algorithm
    //(see: http://www.whatwg.org/specs/web-apps/current-work/multipage/tree-construction.html#adoptionAgency)
    //------------------------------------------------------------------

    //Steps 5-8 of the algorithm
    function aaObtainFormattingElementEntry(p, token) {
        let formattingElementEntry = p.activeFormattingElements.getElementEntryInScopeWithTagName(token.tagName);

        if (formattingElementEntry) {
            if (!p.openElements.contains(formattingElementEntry.element)) {
                p.activeFormattingElements.removeEntry(formattingElementEntry);
                formattingElementEntry = null;
            } else if (!p.openElements.hasInScope(token.tagName)) {
                formattingElementEntry = null;
            }
        } else {
            genericEndTagInBody(p, token);
        }

        return formattingElementEntry;
    }

    //Steps 9 and 10 of the algorithm
    function aaObtainFurthestBlock(p, formattingElementEntry) {
        let furthestBlock = null;

        for (let i = p.openElements.stackTop; i >= 0; i--) {
            const element = p.openElements.items[i];

            if (element === formattingElementEntry.element) {
                break;
            }

            if (p._isSpecialElement(element)) {
                furthestBlock = element;
            }
        }

        if (!furthestBlock) {
            p.openElements.popUntilElementPopped(formattingElementEntry.element);
            p.activeFormattingElements.removeEntry(formattingElementEntry);
        }

        return furthestBlock;
    }

    //Step 13 of the algorithm
    function aaInnerLoop(p, furthestBlock, formattingElement) {
        let lastElement = furthestBlock;
        let nextElement = p.openElements.getCommonAncestor(furthestBlock);

        for (let i = 0, element = nextElement; element !== formattingElement; i++, element = nextElement) {
            //NOTE: store next element for the next loop iteration (it may be deleted from the stack by step 9.5)
            nextElement = p.openElements.getCommonAncestor(element);

            const elementEntry = p.activeFormattingElements.getElementEntry(element);
            const counterOverflow = elementEntry && i >= AA_INNER_LOOP_ITER;
            const shouldRemoveFromOpenElements = !elementEntry || counterOverflow;

            if (shouldRemoveFromOpenElements) {
                if (counterOverflow) {
                    p.activeFormattingElements.removeEntry(elementEntry);
                }

                p.openElements.remove(element);
            } else {
                element = aaRecreateElementFromEntry(p, elementEntry);

                if (lastElement === furthestBlock) {
                    p.activeFormattingElements.bookmark = elementEntry;
                }

                p.treeAdapter.detachNode(lastElement);
                p.treeAdapter.appendChild(element, lastElement);
                lastElement = element;
            }
        }

        return lastElement;
    }

    //Step 13.7 of the algorithm
    function aaRecreateElementFromEntry(p, elementEntry) {
        const ns = p.treeAdapter.getNamespaceURI(elementEntry.element);
        const newElement = p.treeAdapter.createElement(elementEntry.token.tagName, ns, elementEntry.token.attrs);

        p.openElements.replace(elementEntry.element, newElement);
        elementEntry.element = newElement;

        return newElement;
    }

    //Step 14 of the algorithm
    function aaInsertLastNodeInCommonAncestor(p, commonAncestor, lastElement) {
        if (p._isElementCausesFosterParenting(commonAncestor)) {
            p._fosterParentElement(lastElement);
        } else {
            const tn = p.treeAdapter.getTagName(commonAncestor);
            const ns = p.treeAdapter.getNamespaceURI(commonAncestor);

            if (tn === $$4.TEMPLATE && ns === NS$1.HTML) {
                commonAncestor = p.treeAdapter.getTemplateContent(commonAncestor);
            }

            p.treeAdapter.appendChild(commonAncestor, lastElement);
        }
    }

    //Steps 15-19 of the algorithm
    function aaReplaceFormattingElement(p, furthestBlock, formattingElementEntry) {
        const ns = p.treeAdapter.getNamespaceURI(formattingElementEntry.element);
        const token = formattingElementEntry.token;
        const newElement = p.treeAdapter.createElement(token.tagName, ns, token.attrs);

        p._adoptNodes(furthestBlock, newElement);
        p.treeAdapter.appendChild(furthestBlock, newElement);

        p.activeFormattingElements.insertElementAfterBookmark(newElement, formattingElementEntry.token);
        p.activeFormattingElements.removeEntry(formattingElementEntry);

        p.openElements.remove(formattingElementEntry.element);
        p.openElements.insertAfter(furthestBlock, newElement);
    }

    //Algorithm entry point
    function callAdoptionAgency(p, token) {
        let formattingElementEntry;

        for (let i = 0; i < AA_OUTER_LOOP_ITER; i++) {
            formattingElementEntry = aaObtainFormattingElementEntry(p, token);

            if (!formattingElementEntry) {
                break;
            }

            const furthestBlock = aaObtainFurthestBlock(p, formattingElementEntry);

            if (!furthestBlock) {
                break;
            }

            p.activeFormattingElements.bookmark = formattingElementEntry;

            const lastElement = aaInnerLoop(p, furthestBlock, formattingElementEntry.element);
            const commonAncestor = p.openElements.getCommonAncestor(formattingElementEntry.element);

            p.treeAdapter.detachNode(lastElement);
            aaInsertLastNodeInCommonAncestor(p, commonAncestor, lastElement);
            aaReplaceFormattingElement(p, furthestBlock, formattingElementEntry);
        }
    }

    //Generic token handlers
    //------------------------------------------------------------------
    function ignoreToken() {
        //NOTE: do nothing =)
    }

    function misplacedDoctype(p) {
        p._err(errorCodes.misplacedDoctype);
    }

    function appendComment(p, token) {
        p._appendCommentNode(token, p.openElements.currentTmplContent || p.openElements.current);
    }

    function appendCommentToRootHtmlElement(p, token) {
        p._appendCommentNode(token, p.openElements.items[0]);
    }

    function appendCommentToDocument(p, token) {
        p._appendCommentNode(token, p.document);
    }

    function insertCharacters(p, token) {
        p._insertCharacters(token);
    }

    function stopParsing(p) {
        p.stopped = true;
    }

    // The "initial" insertion mode
    //------------------------------------------------------------------
    function doctypeInInitialMode(p, token) {
        p._setDocumentType(token);

        const mode = token.forceQuirks ? html$1.DOCUMENT_MODE.QUIRKS : doctype.getDocumentMode(token);

        if (!doctype.isConforming(token)) {
            p._err(errorCodes.nonConformingDoctype);
        }

        p.treeAdapter.setDocumentMode(p.document, mode);

        p.insertionMode = BEFORE_HTML_MODE;
    }

    function tokenInInitialMode(p, token) {
        p._err(errorCodes.missingDoctype, { beforeToken: true });
        p.treeAdapter.setDocumentMode(p.document, html$1.DOCUMENT_MODE.QUIRKS);
        p.insertionMode = BEFORE_HTML_MODE;
        p._processToken(token);
    }

    // The "before html" insertion mode
    //------------------------------------------------------------------
    function startTagBeforeHtml(p, token) {
        if (token.tagName === $$4.HTML) {
            p._insertElement(token, NS$1.HTML);
            p.insertionMode = BEFORE_HEAD_MODE;
        } else {
            tokenBeforeHtml(p, token);
        }
    }

    function endTagBeforeHtml(p, token) {
        const tn = token.tagName;

        if (tn === $$4.HTML || tn === $$4.HEAD || tn === $$4.BODY || tn === $$4.BR) {
            tokenBeforeHtml(p, token);
        }
    }

    function tokenBeforeHtml(p, token) {
        p._insertFakeRootElement();
        p.insertionMode = BEFORE_HEAD_MODE;
        p._processToken(token);
    }

    // The "before head" insertion mode
    //------------------------------------------------------------------
    function startTagBeforeHead(p, token) {
        const tn = token.tagName;

        if (tn === $$4.HTML) {
            startTagInBody(p, token);
        } else if (tn === $$4.HEAD) {
            p._insertElement(token, NS$1.HTML);
            p.headElement = p.openElements.current;
            p.insertionMode = IN_HEAD_MODE;
        } else {
            tokenBeforeHead(p, token);
        }
    }

    function endTagBeforeHead(p, token) {
        const tn = token.tagName;

        if (tn === $$4.HEAD || tn === $$4.BODY || tn === $$4.HTML || tn === $$4.BR) {
            tokenBeforeHead(p, token);
        } else {
            p._err(errorCodes.endTagWithoutMatchingOpenElement);
        }
    }

    function tokenBeforeHead(p, token) {
        p._insertFakeElement($$4.HEAD);
        p.headElement = p.openElements.current;
        p.insertionMode = IN_HEAD_MODE;
        p._processToken(token);
    }

    // The "in head" insertion mode
    //------------------------------------------------------------------
    function startTagInHead(p, token) {
        const tn = token.tagName;

        if (tn === $$4.HTML) {
            startTagInBody(p, token);
        } else if (tn === $$4.BASE || tn === $$4.BASEFONT || tn === $$4.BGSOUND || tn === $$4.LINK || tn === $$4.META) {
            p._appendElement(token, NS$1.HTML);
            token.ackSelfClosing = true;
        } else if (tn === $$4.TITLE) {
            p._switchToTextParsing(token, tokenizer.MODE.RCDATA);
        } else if (tn === $$4.NOSCRIPT) {
            if (p.options.scriptingEnabled) {
                p._switchToTextParsing(token, tokenizer.MODE.RAWTEXT);
            } else {
                p._insertElement(token, NS$1.HTML);
                p.insertionMode = IN_HEAD_NO_SCRIPT_MODE;
            }
        } else if (tn === $$4.NOFRAMES || tn === $$4.STYLE) {
            p._switchToTextParsing(token, tokenizer.MODE.RAWTEXT);
        } else if (tn === $$4.SCRIPT) {
            p._switchToTextParsing(token, tokenizer.MODE.SCRIPT_DATA);
        } else if (tn === $$4.TEMPLATE) {
            p._insertTemplate(token, NS$1.HTML);
            p.activeFormattingElements.insertMarker();
            p.framesetOk = false;
            p.insertionMode = IN_TEMPLATE_MODE;
            p._pushTmplInsertionMode(IN_TEMPLATE_MODE);
        } else if (tn === $$4.HEAD) {
            p._err(errorCodes.misplacedStartTagForHeadElement);
        } else {
            tokenInHead(p, token);
        }
    }

    function endTagInHead(p, token) {
        const tn = token.tagName;

        if (tn === $$4.HEAD) {
            p.openElements.pop();
            p.insertionMode = AFTER_HEAD_MODE;
        } else if (tn === $$4.BODY || tn === $$4.BR || tn === $$4.HTML) {
            tokenInHead(p, token);
        } else if (tn === $$4.TEMPLATE) {
            if (p.openElements.tmplCount > 0) {
                p.openElements.generateImpliedEndTagsThoroughly();

                if (p.openElements.currentTagName !== $$4.TEMPLATE) {
                    p._err(errorCodes.closingOfElementWithOpenChildElements);
                }

                p.openElements.popUntilTagNamePopped($$4.TEMPLATE);
                p.activeFormattingElements.clearToLastMarker();
                p._popTmplInsertionMode();
                p._resetInsertionMode();
            } else {
                p._err(errorCodes.endTagWithoutMatchingOpenElement);
            }
        } else {
            p._err(errorCodes.endTagWithoutMatchingOpenElement);
        }
    }

    function tokenInHead(p, token) {
        p.openElements.pop();
        p.insertionMode = AFTER_HEAD_MODE;
        p._processToken(token);
    }

    // The "in head no script" insertion mode
    //------------------------------------------------------------------
    function startTagInHeadNoScript(p, token) {
        const tn = token.tagName;

        if (tn === $$4.HTML) {
            startTagInBody(p, token);
        } else if (
            tn === $$4.BASEFONT ||
            tn === $$4.BGSOUND ||
            tn === $$4.HEAD ||
            tn === $$4.LINK ||
            tn === $$4.META ||
            tn === $$4.NOFRAMES ||
            tn === $$4.STYLE
        ) {
            startTagInHead(p, token);
        } else if (tn === $$4.NOSCRIPT) {
            p._err(errorCodes.nestedNoscriptInHead);
        } else {
            tokenInHeadNoScript(p, token);
        }
    }

    function endTagInHeadNoScript(p, token) {
        const tn = token.tagName;

        if (tn === $$4.NOSCRIPT) {
            p.openElements.pop();
            p.insertionMode = IN_HEAD_MODE;
        } else if (tn === $$4.BR) {
            tokenInHeadNoScript(p, token);
        } else {
            p._err(errorCodes.endTagWithoutMatchingOpenElement);
        }
    }

    function tokenInHeadNoScript(p, token) {
        const errCode =
            token.type === tokenizer.EOF_TOKEN ? errorCodes.openElementsLeftAfterEof : errorCodes.disallowedContentInNoscriptInHead;

        p._err(errCode);
        p.openElements.pop();
        p.insertionMode = IN_HEAD_MODE;
        p._processToken(token);
    }

    // The "after head" insertion mode
    //------------------------------------------------------------------
    function startTagAfterHead(p, token) {
        const tn = token.tagName;

        if (tn === $$4.HTML) {
            startTagInBody(p, token);
        } else if (tn === $$4.BODY) {
            p._insertElement(token, NS$1.HTML);
            p.framesetOk = false;
            p.insertionMode = IN_BODY_MODE;
        } else if (tn === $$4.FRAMESET) {
            p._insertElement(token, NS$1.HTML);
            p.insertionMode = IN_FRAMESET_MODE;
        } else if (
            tn === $$4.BASE ||
            tn === $$4.BASEFONT ||
            tn === $$4.BGSOUND ||
            tn === $$4.LINK ||
            tn === $$4.META ||
            tn === $$4.NOFRAMES ||
            tn === $$4.SCRIPT ||
            tn === $$4.STYLE ||
            tn === $$4.TEMPLATE ||
            tn === $$4.TITLE
        ) {
            p._err(errorCodes.abandonedHeadElementChild);
            p.openElements.push(p.headElement);
            startTagInHead(p, token);
            p.openElements.remove(p.headElement);
        } else if (tn === $$4.HEAD) {
            p._err(errorCodes.misplacedStartTagForHeadElement);
        } else {
            tokenAfterHead(p, token);
        }
    }

    function endTagAfterHead(p, token) {
        const tn = token.tagName;

        if (tn === $$4.BODY || tn === $$4.HTML || tn === $$4.BR) {
            tokenAfterHead(p, token);
        } else if (tn === $$4.TEMPLATE) {
            endTagInHead(p, token);
        } else {
            p._err(errorCodes.endTagWithoutMatchingOpenElement);
        }
    }

    function tokenAfterHead(p, token) {
        p._insertFakeElement($$4.BODY);
        p.insertionMode = IN_BODY_MODE;
        p._processToken(token);
    }

    // The "in body" insertion mode
    //------------------------------------------------------------------
    function whitespaceCharacterInBody(p, token) {
        p._reconstructActiveFormattingElements();
        p._insertCharacters(token);
    }

    function characterInBody(p, token) {
        p._reconstructActiveFormattingElements();
        p._insertCharacters(token);
        p.framesetOk = false;
    }

    function htmlStartTagInBody(p, token) {
        if (p.openElements.tmplCount === 0) {
            p.treeAdapter.adoptAttributes(p.openElements.items[0], token.attrs);
        }
    }

    function bodyStartTagInBody(p, token) {
        const bodyElement = p.openElements.tryPeekProperlyNestedBodyElement();

        if (bodyElement && p.openElements.tmplCount === 0) {
            p.framesetOk = false;
            p.treeAdapter.adoptAttributes(bodyElement, token.attrs);
        }
    }

    function framesetStartTagInBody(p, token) {
        const bodyElement = p.openElements.tryPeekProperlyNestedBodyElement();

        if (p.framesetOk && bodyElement) {
            p.treeAdapter.detachNode(bodyElement);
            p.openElements.popAllUpToHtmlElement();
            p._insertElement(token, NS$1.HTML);
            p.insertionMode = IN_FRAMESET_MODE;
        }
    }

    function addressStartTagInBody(p, token) {
        if (p.openElements.hasInButtonScope($$4.P)) {
            p._closePElement();
        }

        p._insertElement(token, NS$1.HTML);
    }

    function numberedHeaderStartTagInBody(p, token) {
        if (p.openElements.hasInButtonScope($$4.P)) {
            p._closePElement();
        }

        const tn = p.openElements.currentTagName;

        if (tn === $$4.H1 || tn === $$4.H2 || tn === $$4.H3 || tn === $$4.H4 || tn === $$4.H5 || tn === $$4.H6) {
            p.openElements.pop();
        }

        p._insertElement(token, NS$1.HTML);
    }

    function preStartTagInBody(p, token) {
        if (p.openElements.hasInButtonScope($$4.P)) {
            p._closePElement();
        }

        p._insertElement(token, NS$1.HTML);
        //NOTE: If the next token is a U+000A LINE FEED (LF) character token, then ignore that token and move
        //on to the next one. (Newlines at the start of pre blocks are ignored as an authoring convenience.)
        p.skipNextNewLine = true;
        p.framesetOk = false;
    }

    function formStartTagInBody(p, token) {
        const inTemplate = p.openElements.tmplCount > 0;

        if (!p.formElement || inTemplate) {
            if (p.openElements.hasInButtonScope($$4.P)) {
                p._closePElement();
            }

            p._insertElement(token, NS$1.HTML);

            if (!inTemplate) {
                p.formElement = p.openElements.current;
            }
        }
    }

    function listItemStartTagInBody(p, token) {
        p.framesetOk = false;

        const tn = token.tagName;

        for (let i = p.openElements.stackTop; i >= 0; i--) {
            const element = p.openElements.items[i];
            const elementTn = p.treeAdapter.getTagName(element);
            let closeTn = null;

            if (tn === $$4.LI && elementTn === $$4.LI) {
                closeTn = $$4.LI;
            } else if ((tn === $$4.DD || tn === $$4.DT) && (elementTn === $$4.DD || elementTn === $$4.DT)) {
                closeTn = elementTn;
            }

            if (closeTn) {
                p.openElements.generateImpliedEndTagsWithExclusion(closeTn);
                p.openElements.popUntilTagNamePopped(closeTn);
                break;
            }

            if (elementTn !== $$4.ADDRESS && elementTn !== $$4.DIV && elementTn !== $$4.P && p._isSpecialElement(element)) {
                break;
            }
        }

        if (p.openElements.hasInButtonScope($$4.P)) {
            p._closePElement();
        }

        p._insertElement(token, NS$1.HTML);
    }

    function plaintextStartTagInBody(p, token) {
        if (p.openElements.hasInButtonScope($$4.P)) {
            p._closePElement();
        }

        p._insertElement(token, NS$1.HTML);
        p.tokenizer.state = tokenizer.MODE.PLAINTEXT;
    }

    function buttonStartTagInBody(p, token) {
        if (p.openElements.hasInScope($$4.BUTTON)) {
            p.openElements.generateImpliedEndTags();
            p.openElements.popUntilTagNamePopped($$4.BUTTON);
        }

        p._reconstructActiveFormattingElements();
        p._insertElement(token, NS$1.HTML);
        p.framesetOk = false;
    }

    function aStartTagInBody(p, token) {
        const activeElementEntry = p.activeFormattingElements.getElementEntryInScopeWithTagName($$4.A);

        if (activeElementEntry) {
            callAdoptionAgency(p, token);
            p.openElements.remove(activeElementEntry.element);
            p.activeFormattingElements.removeEntry(activeElementEntry);
        }

        p._reconstructActiveFormattingElements();
        p._insertElement(token, NS$1.HTML);
        p.activeFormattingElements.pushElement(p.openElements.current, token);
    }

    function bStartTagInBody(p, token) {
        p._reconstructActiveFormattingElements();
        p._insertElement(token, NS$1.HTML);
        p.activeFormattingElements.pushElement(p.openElements.current, token);
    }

    function nobrStartTagInBody(p, token) {
        p._reconstructActiveFormattingElements();

        if (p.openElements.hasInScope($$4.NOBR)) {
            callAdoptionAgency(p, token);
            p._reconstructActiveFormattingElements();
        }

        p._insertElement(token, NS$1.HTML);
        p.activeFormattingElements.pushElement(p.openElements.current, token);
    }

    function appletStartTagInBody(p, token) {
        p._reconstructActiveFormattingElements();
        p._insertElement(token, NS$1.HTML);
        p.activeFormattingElements.insertMarker();
        p.framesetOk = false;
    }

    function tableStartTagInBody(p, token) {
        if (
            p.treeAdapter.getDocumentMode(p.document) !== html$1.DOCUMENT_MODE.QUIRKS &&
            p.openElements.hasInButtonScope($$4.P)
        ) {
            p._closePElement();
        }

        p._insertElement(token, NS$1.HTML);
        p.framesetOk = false;
        p.insertionMode = IN_TABLE_MODE;
    }

    function areaStartTagInBody(p, token) {
        p._reconstructActiveFormattingElements();
        p._appendElement(token, NS$1.HTML);
        p.framesetOk = false;
        token.ackSelfClosing = true;
    }

    function inputStartTagInBody(p, token) {
        p._reconstructActiveFormattingElements();
        p._appendElement(token, NS$1.HTML);

        const inputType = tokenizer.getTokenAttr(token, ATTRS.TYPE);

        if (!inputType || inputType.toLowerCase() !== HIDDEN_INPUT_TYPE) {
            p.framesetOk = false;
        }

        token.ackSelfClosing = true;
    }

    function paramStartTagInBody(p, token) {
        p._appendElement(token, NS$1.HTML);
        token.ackSelfClosing = true;
    }

    function hrStartTagInBody(p, token) {
        if (p.openElements.hasInButtonScope($$4.P)) {
            p._closePElement();
        }

        p._appendElement(token, NS$1.HTML);
        p.framesetOk = false;
        token.ackSelfClosing = true;
    }

    function imageStartTagInBody(p, token) {
        token.tagName = $$4.IMG;
        areaStartTagInBody(p, token);
    }

    function textareaStartTagInBody(p, token) {
        p._insertElement(token, NS$1.HTML);
        //NOTE: If the next token is a U+000A LINE FEED (LF) character token, then ignore that token and move
        //on to the next one. (Newlines at the start of textarea elements are ignored as an authoring convenience.)
        p.skipNextNewLine = true;
        p.tokenizer.state = tokenizer.MODE.RCDATA;
        p.originalInsertionMode = p.insertionMode;
        p.framesetOk = false;
        p.insertionMode = TEXT_MODE;
    }

    function xmpStartTagInBody(p, token) {
        if (p.openElements.hasInButtonScope($$4.P)) {
            p._closePElement();
        }

        p._reconstructActiveFormattingElements();
        p.framesetOk = false;
        p._switchToTextParsing(token, tokenizer.MODE.RAWTEXT);
    }

    function iframeStartTagInBody(p, token) {
        p.framesetOk = false;
        p._switchToTextParsing(token, tokenizer.MODE.RAWTEXT);
    }

    //NOTE: here we assume that we always act as an user agent with enabled plugins, so we parse
    //<noembed> as a rawtext.
    function noembedStartTagInBody(p, token) {
        p._switchToTextParsing(token, tokenizer.MODE.RAWTEXT);
    }

    function selectStartTagInBody(p, token) {
        p._reconstructActiveFormattingElements();
        p._insertElement(token, NS$1.HTML);
        p.framesetOk = false;

        if (
            p.insertionMode === IN_TABLE_MODE ||
            p.insertionMode === IN_CAPTION_MODE ||
            p.insertionMode === IN_TABLE_BODY_MODE ||
            p.insertionMode === IN_ROW_MODE ||
            p.insertionMode === IN_CELL_MODE
        ) {
            p.insertionMode = IN_SELECT_IN_TABLE_MODE;
        } else {
            p.insertionMode = IN_SELECT_MODE;
        }
    }

    function optgroupStartTagInBody(p, token) {
        if (p.openElements.currentTagName === $$4.OPTION) {
            p.openElements.pop();
        }

        p._reconstructActiveFormattingElements();
        p._insertElement(token, NS$1.HTML);
    }

    function rbStartTagInBody(p, token) {
        if (p.openElements.hasInScope($$4.RUBY)) {
            p.openElements.generateImpliedEndTags();
        }

        p._insertElement(token, NS$1.HTML);
    }

    function rtStartTagInBody(p, token) {
        if (p.openElements.hasInScope($$4.RUBY)) {
            p.openElements.generateImpliedEndTagsWithExclusion($$4.RTC);
        }

        p._insertElement(token, NS$1.HTML);
    }

    function menuStartTagInBody(p, token) {
        if (p.openElements.hasInButtonScope($$4.P)) {
            p._closePElement();
        }

        p._insertElement(token, NS$1.HTML);
    }

    function mathStartTagInBody(p, token) {
        p._reconstructActiveFormattingElements();

        foreignContent.adjustTokenMathMLAttrs(token);
        foreignContent.adjustTokenXMLAttrs(token);

        if (token.selfClosing) {
            p._appendElement(token, NS$1.MATHML);
        } else {
            p._insertElement(token, NS$1.MATHML);
        }

        token.ackSelfClosing = true;
    }

    function svgStartTagInBody(p, token) {
        p._reconstructActiveFormattingElements();

        foreignContent.adjustTokenSVGAttrs(token);
        foreignContent.adjustTokenXMLAttrs(token);

        if (token.selfClosing) {
            p._appendElement(token, NS$1.SVG);
        } else {
            p._insertElement(token, NS$1.SVG);
        }

        token.ackSelfClosing = true;
    }

    function genericStartTagInBody(p, token) {
        p._reconstructActiveFormattingElements();
        p._insertElement(token, NS$1.HTML);
    }

    //OPTIMIZATION: Integer comparisons are low-cost, so we can use very fast tag name length filters here.
    //It's faster than using dictionary.
    function startTagInBody(p, token) {
        const tn = token.tagName;

        switch (tn.length) {
            case 1:
                if (tn === $$4.I || tn === $$4.S || tn === $$4.B || tn === $$4.U) {
                    bStartTagInBody(p, token);
                } else if (tn === $$4.P) {
                    addressStartTagInBody(p, token);
                } else if (tn === $$4.A) {
                    aStartTagInBody(p, token);
                } else {
                    genericStartTagInBody(p, token);
                }

                break;

            case 2:
                if (tn === $$4.DL || tn === $$4.OL || tn === $$4.UL) {
                    addressStartTagInBody(p, token);
                } else if (tn === $$4.H1 || tn === $$4.H2 || tn === $$4.H3 || tn === $$4.H4 || tn === $$4.H5 || tn === $$4.H6) {
                    numberedHeaderStartTagInBody(p, token);
                } else if (tn === $$4.LI || tn === $$4.DD || tn === $$4.DT) {
                    listItemStartTagInBody(p, token);
                } else if (tn === $$4.EM || tn === $$4.TT) {
                    bStartTagInBody(p, token);
                } else if (tn === $$4.BR) {
                    areaStartTagInBody(p, token);
                } else if (tn === $$4.HR) {
                    hrStartTagInBody(p, token);
                } else if (tn === $$4.RB) {
                    rbStartTagInBody(p, token);
                } else if (tn === $$4.RT || tn === $$4.RP) {
                    rtStartTagInBody(p, token);
                } else if (tn !== $$4.TH && tn !== $$4.TD && tn !== $$4.TR) {
                    genericStartTagInBody(p, token);
                }

                break;

            case 3:
                if (tn === $$4.DIV || tn === $$4.DIR || tn === $$4.NAV) {
                    addressStartTagInBody(p, token);
                } else if (tn === $$4.PRE) {
                    preStartTagInBody(p, token);
                } else if (tn === $$4.BIG) {
                    bStartTagInBody(p, token);
                } else if (tn === $$4.IMG || tn === $$4.WBR) {
                    areaStartTagInBody(p, token);
                } else if (tn === $$4.XMP) {
                    xmpStartTagInBody(p, token);
                } else if (tn === $$4.SVG) {
                    svgStartTagInBody(p, token);
                } else if (tn === $$4.RTC) {
                    rbStartTagInBody(p, token);
                } else if (tn !== $$4.COL) {
                    genericStartTagInBody(p, token);
                }

                break;

            case 4:
                if (tn === $$4.HTML) {
                    htmlStartTagInBody(p, token);
                } else if (tn === $$4.BASE || tn === $$4.LINK || tn === $$4.META) {
                    startTagInHead(p, token);
                } else if (tn === $$4.BODY) {
                    bodyStartTagInBody(p, token);
                } else if (tn === $$4.MAIN || tn === $$4.MENU) {
                    addressStartTagInBody(p, token);
                } else if (tn === $$4.FORM) {
                    formStartTagInBody(p, token);
                } else if (tn === $$4.CODE || tn === $$4.FONT) {
                    bStartTagInBody(p, token);
                } else if (tn === $$4.NOBR) {
                    nobrStartTagInBody(p, token);
                } else if (tn === $$4.AREA) {
                    areaStartTagInBody(p, token);
                } else if (tn === $$4.MATH) {
                    mathStartTagInBody(p, token);
                } else if (tn === $$4.MENU) {
                    menuStartTagInBody(p, token);
                } else if (tn !== $$4.HEAD) {
                    genericStartTagInBody(p, token);
                }

                break;

            case 5:
                if (tn === $$4.STYLE || tn === $$4.TITLE) {
                    startTagInHead(p, token);
                } else if (tn === $$4.ASIDE) {
                    addressStartTagInBody(p, token);
                } else if (tn === $$4.SMALL) {
                    bStartTagInBody(p, token);
                } else if (tn === $$4.TABLE) {
                    tableStartTagInBody(p, token);
                } else if (tn === $$4.EMBED) {
                    areaStartTagInBody(p, token);
                } else if (tn === $$4.INPUT) {
                    inputStartTagInBody(p, token);
                } else if (tn === $$4.PARAM || tn === $$4.TRACK) {
                    paramStartTagInBody(p, token);
                } else if (tn === $$4.IMAGE) {
                    imageStartTagInBody(p, token);
                } else if (tn !== $$4.FRAME && tn !== $$4.TBODY && tn !== $$4.TFOOT && tn !== $$4.THEAD) {
                    genericStartTagInBody(p, token);
                }

                break;

            case 6:
                if (tn === $$4.SCRIPT) {
                    startTagInHead(p, token);
                } else if (
                    tn === $$4.CENTER ||
                    tn === $$4.FIGURE ||
                    tn === $$4.FOOTER ||
                    tn === $$4.HEADER ||
                    tn === $$4.HGROUP ||
                    tn === $$4.DIALOG
                ) {
                    addressStartTagInBody(p, token);
                } else if (tn === $$4.BUTTON) {
                    buttonStartTagInBody(p, token);
                } else if (tn === $$4.STRIKE || tn === $$4.STRONG) {
                    bStartTagInBody(p, token);
                } else if (tn === $$4.APPLET || tn === $$4.OBJECT) {
                    appletStartTagInBody(p, token);
                } else if (tn === $$4.KEYGEN) {
                    areaStartTagInBody(p, token);
                } else if (tn === $$4.SOURCE) {
                    paramStartTagInBody(p, token);
                } else if (tn === $$4.IFRAME) {
                    iframeStartTagInBody(p, token);
                } else if (tn === $$4.SELECT) {
                    selectStartTagInBody(p, token);
                } else if (tn === $$4.OPTION) {
                    optgroupStartTagInBody(p, token);
                } else {
                    genericStartTagInBody(p, token);
                }

                break;

            case 7:
                if (tn === $$4.BGSOUND) {
                    startTagInHead(p, token);
                } else if (
                    tn === $$4.DETAILS ||
                    tn === $$4.ADDRESS ||
                    tn === $$4.ARTICLE ||
                    tn === $$4.SECTION ||
                    tn === $$4.SUMMARY
                ) {
                    addressStartTagInBody(p, token);
                } else if (tn === $$4.LISTING) {
                    preStartTagInBody(p, token);
                } else if (tn === $$4.MARQUEE) {
                    appletStartTagInBody(p, token);
                } else if (tn === $$4.NOEMBED) {
                    noembedStartTagInBody(p, token);
                } else if (tn !== $$4.CAPTION) {
                    genericStartTagInBody(p, token);
                }

                break;

            case 8:
                if (tn === $$4.BASEFONT) {
                    startTagInHead(p, token);
                } else if (tn === $$4.FRAMESET) {
                    framesetStartTagInBody(p, token);
                } else if (tn === $$4.FIELDSET) {
                    addressStartTagInBody(p, token);
                } else if (tn === $$4.TEXTAREA) {
                    textareaStartTagInBody(p, token);
                } else if (tn === $$4.TEMPLATE) {
                    startTagInHead(p, token);
                } else if (tn === $$4.NOSCRIPT) {
                    if (p.options.scriptingEnabled) {
                        noembedStartTagInBody(p, token);
                    } else {
                        genericStartTagInBody(p, token);
                    }
                } else if (tn === $$4.OPTGROUP) {
                    optgroupStartTagInBody(p, token);
                } else if (tn !== $$4.COLGROUP) {
                    genericStartTagInBody(p, token);
                }

                break;

            case 9:
                if (tn === $$4.PLAINTEXT) {
                    plaintextStartTagInBody(p, token);
                } else {
                    genericStartTagInBody(p, token);
                }

                break;

            case 10:
                if (tn === $$4.BLOCKQUOTE || tn === $$4.FIGCAPTION) {
                    addressStartTagInBody(p, token);
                } else {
                    genericStartTagInBody(p, token);
                }

                break;

            default:
                genericStartTagInBody(p, token);
        }
    }

    function bodyEndTagInBody(p) {
        if (p.openElements.hasInScope($$4.BODY)) {
            p.insertionMode = AFTER_BODY_MODE;
        }
    }

    function htmlEndTagInBody(p, token) {
        if (p.openElements.hasInScope($$4.BODY)) {
            p.insertionMode = AFTER_BODY_MODE;
            p._processToken(token);
        }
    }

    function addressEndTagInBody(p, token) {
        const tn = token.tagName;

        if (p.openElements.hasInScope(tn)) {
            p.openElements.generateImpliedEndTags();
            p.openElements.popUntilTagNamePopped(tn);
        }
    }

    function formEndTagInBody(p) {
        const inTemplate = p.openElements.tmplCount > 0;
        const formElement = p.formElement;

        if (!inTemplate) {
            p.formElement = null;
        }

        if ((formElement || inTemplate) && p.openElements.hasInScope($$4.FORM)) {
            p.openElements.generateImpliedEndTags();

            if (inTemplate) {
                p.openElements.popUntilTagNamePopped($$4.FORM);
            } else {
                p.openElements.remove(formElement);
            }
        }
    }

    function pEndTagInBody(p) {
        if (!p.openElements.hasInButtonScope($$4.P)) {
            p._insertFakeElement($$4.P);
        }

        p._closePElement();
    }

    function liEndTagInBody(p) {
        if (p.openElements.hasInListItemScope($$4.LI)) {
            p.openElements.generateImpliedEndTagsWithExclusion($$4.LI);
            p.openElements.popUntilTagNamePopped($$4.LI);
        }
    }

    function ddEndTagInBody(p, token) {
        const tn = token.tagName;

        if (p.openElements.hasInScope(tn)) {
            p.openElements.generateImpliedEndTagsWithExclusion(tn);
            p.openElements.popUntilTagNamePopped(tn);
        }
    }

    function numberedHeaderEndTagInBody(p) {
        if (p.openElements.hasNumberedHeaderInScope()) {
            p.openElements.generateImpliedEndTags();
            p.openElements.popUntilNumberedHeaderPopped();
        }
    }

    function appletEndTagInBody(p, token) {
        const tn = token.tagName;

        if (p.openElements.hasInScope(tn)) {
            p.openElements.generateImpliedEndTags();
            p.openElements.popUntilTagNamePopped(tn);
            p.activeFormattingElements.clearToLastMarker();
        }
    }

    function brEndTagInBody(p) {
        p._reconstructActiveFormattingElements();
        p._insertFakeElement($$4.BR);
        p.openElements.pop();
        p.framesetOk = false;
    }

    function genericEndTagInBody(p, token) {
        const tn = token.tagName;

        for (let i = p.openElements.stackTop; i > 0; i--) {
            const element = p.openElements.items[i];

            if (p.treeAdapter.getTagName(element) === tn) {
                p.openElements.generateImpliedEndTagsWithExclusion(tn);
                p.openElements.popUntilElementPopped(element);
                break;
            }

            if (p._isSpecialElement(element)) {
                break;
            }
        }
    }

    //OPTIMIZATION: Integer comparisons are low-cost, so we can use very fast tag name length filters here.
    //It's faster than using dictionary.
    function endTagInBody(p, token) {
        const tn = token.tagName;

        switch (tn.length) {
            case 1:
                if (tn === $$4.A || tn === $$4.B || tn === $$4.I || tn === $$4.S || tn === $$4.U) {
                    callAdoptionAgency(p, token);
                } else if (tn === $$4.P) {
                    pEndTagInBody(p);
                } else {
                    genericEndTagInBody(p, token);
                }

                break;

            case 2:
                if (tn === $$4.DL || tn === $$4.UL || tn === $$4.OL) {
                    addressEndTagInBody(p, token);
                } else if (tn === $$4.LI) {
                    liEndTagInBody(p);
                } else if (tn === $$4.DD || tn === $$4.DT) {
                    ddEndTagInBody(p, token);
                } else if (tn === $$4.H1 || tn === $$4.H2 || tn === $$4.H3 || tn === $$4.H4 || tn === $$4.H5 || tn === $$4.H6) {
                    numberedHeaderEndTagInBody(p);
                } else if (tn === $$4.BR) {
                    brEndTagInBody(p);
                } else if (tn === $$4.EM || tn === $$4.TT) {
                    callAdoptionAgency(p, token);
                } else {
                    genericEndTagInBody(p, token);
                }

                break;

            case 3:
                if (tn === $$4.BIG) {
                    callAdoptionAgency(p, token);
                } else if (tn === $$4.DIR || tn === $$4.DIV || tn === $$4.NAV || tn === $$4.PRE) {
                    addressEndTagInBody(p, token);
                } else {
                    genericEndTagInBody(p, token);
                }

                break;

            case 4:
                if (tn === $$4.BODY) {
                    bodyEndTagInBody(p);
                } else if (tn === $$4.HTML) {
                    htmlEndTagInBody(p, token);
                } else if (tn === $$4.FORM) {
                    formEndTagInBody(p);
                } else if (tn === $$4.CODE || tn === $$4.FONT || tn === $$4.NOBR) {
                    callAdoptionAgency(p, token);
                } else if (tn === $$4.MAIN || tn === $$4.MENU) {
                    addressEndTagInBody(p, token);
                } else {
                    genericEndTagInBody(p, token);
                }

                break;

            case 5:
                if (tn === $$4.ASIDE) {
                    addressEndTagInBody(p, token);
                } else if (tn === $$4.SMALL) {
                    callAdoptionAgency(p, token);
                } else {
                    genericEndTagInBody(p, token);
                }

                break;

            case 6:
                if (
                    tn === $$4.CENTER ||
                    tn === $$4.FIGURE ||
                    tn === $$4.FOOTER ||
                    tn === $$4.HEADER ||
                    tn === $$4.HGROUP ||
                    tn === $$4.DIALOG
                ) {
                    addressEndTagInBody(p, token);
                } else if (tn === $$4.APPLET || tn === $$4.OBJECT) {
                    appletEndTagInBody(p, token);
                } else if (tn === $$4.STRIKE || tn === $$4.STRONG) {
                    callAdoptionAgency(p, token);
                } else {
                    genericEndTagInBody(p, token);
                }

                break;

            case 7:
                if (
                    tn === $$4.ADDRESS ||
                    tn === $$4.ARTICLE ||
                    tn === $$4.DETAILS ||
                    tn === $$4.SECTION ||
                    tn === $$4.SUMMARY ||
                    tn === $$4.LISTING
                ) {
                    addressEndTagInBody(p, token);
                } else if (tn === $$4.MARQUEE) {
                    appletEndTagInBody(p, token);
                } else {
                    genericEndTagInBody(p, token);
                }

                break;

            case 8:
                if (tn === $$4.FIELDSET) {
                    addressEndTagInBody(p, token);
                } else if (tn === $$4.TEMPLATE) {
                    endTagInHead(p, token);
                } else {
                    genericEndTagInBody(p, token);
                }

                break;

            case 10:
                if (tn === $$4.BLOCKQUOTE || tn === $$4.FIGCAPTION) {
                    addressEndTagInBody(p, token);
                } else {
                    genericEndTagInBody(p, token);
                }

                break;

            default:
                genericEndTagInBody(p, token);
        }
    }

    function eofInBody(p, token) {
        if (p.tmplInsertionModeStackTop > -1) {
            eofInTemplate(p, token);
        } else {
            p.stopped = true;
        }
    }

    // The "text" insertion mode
    //------------------------------------------------------------------
    function endTagInText(p, token) {
        if (token.tagName === $$4.SCRIPT) {
            p.pendingScript = p.openElements.current;
        }

        p.openElements.pop();
        p.insertionMode = p.originalInsertionMode;
    }

    function eofInText(p, token) {
        p._err(errorCodes.eofInElementThatCanContainOnlyText);
        p.openElements.pop();
        p.insertionMode = p.originalInsertionMode;
        p._processToken(token);
    }

    // The "in table" insertion mode
    //------------------------------------------------------------------
    function characterInTable(p, token) {
        const curTn = p.openElements.currentTagName;

        if (curTn === $$4.TABLE || curTn === $$4.TBODY || curTn === $$4.TFOOT || curTn === $$4.THEAD || curTn === $$4.TR) {
            p.pendingCharacterTokens = [];
            p.hasNonWhitespacePendingCharacterToken = false;
            p.originalInsertionMode = p.insertionMode;
            p.insertionMode = IN_TABLE_TEXT_MODE;
            p._processToken(token);
        } else {
            tokenInTable(p, token);
        }
    }

    function captionStartTagInTable(p, token) {
        p.openElements.clearBackToTableContext();
        p.activeFormattingElements.insertMarker();
        p._insertElement(token, NS$1.HTML);
        p.insertionMode = IN_CAPTION_MODE;
    }

    function colgroupStartTagInTable(p, token) {
        p.openElements.clearBackToTableContext();
        p._insertElement(token, NS$1.HTML);
        p.insertionMode = IN_COLUMN_GROUP_MODE;
    }

    function colStartTagInTable(p, token) {
        p.openElements.clearBackToTableContext();
        p._insertFakeElement($$4.COLGROUP);
        p.insertionMode = IN_COLUMN_GROUP_MODE;
        p._processToken(token);
    }

    function tbodyStartTagInTable(p, token) {
        p.openElements.clearBackToTableContext();
        p._insertElement(token, NS$1.HTML);
        p.insertionMode = IN_TABLE_BODY_MODE;
    }

    function tdStartTagInTable(p, token) {
        p.openElements.clearBackToTableContext();
        p._insertFakeElement($$4.TBODY);
        p.insertionMode = IN_TABLE_BODY_MODE;
        p._processToken(token);
    }

    function tableStartTagInTable(p, token) {
        if (p.openElements.hasInTableScope($$4.TABLE)) {
            p.openElements.popUntilTagNamePopped($$4.TABLE);
            p._resetInsertionMode();
            p._processToken(token);
        }
    }

    function inputStartTagInTable(p, token) {
        const inputType = tokenizer.getTokenAttr(token, ATTRS.TYPE);

        if (inputType && inputType.toLowerCase() === HIDDEN_INPUT_TYPE) {
            p._appendElement(token, NS$1.HTML);
        } else {
            tokenInTable(p, token);
        }

        token.ackSelfClosing = true;
    }

    function formStartTagInTable(p, token) {
        if (!p.formElement && p.openElements.tmplCount === 0) {
            p._insertElement(token, NS$1.HTML);
            p.formElement = p.openElements.current;
            p.openElements.pop();
        }
    }

    function startTagInTable(p, token) {
        const tn = token.tagName;

        switch (tn.length) {
            case 2:
                if (tn === $$4.TD || tn === $$4.TH || tn === $$4.TR) {
                    tdStartTagInTable(p, token);
                } else {
                    tokenInTable(p, token);
                }

                break;

            case 3:
                if (tn === $$4.COL) {
                    colStartTagInTable(p, token);
                } else {
                    tokenInTable(p, token);
                }

                break;

            case 4:
                if (tn === $$4.FORM) {
                    formStartTagInTable(p, token);
                } else {
                    tokenInTable(p, token);
                }

                break;

            case 5:
                if (tn === $$4.TABLE) {
                    tableStartTagInTable(p, token);
                } else if (tn === $$4.STYLE) {
                    startTagInHead(p, token);
                } else if (tn === $$4.TBODY || tn === $$4.TFOOT || tn === $$4.THEAD) {
                    tbodyStartTagInTable(p, token);
                } else if (tn === $$4.INPUT) {
                    inputStartTagInTable(p, token);
                } else {
                    tokenInTable(p, token);
                }

                break;

            case 6:
                if (tn === $$4.SCRIPT) {
                    startTagInHead(p, token);
                } else {
                    tokenInTable(p, token);
                }

                break;

            case 7:
                if (tn === $$4.CAPTION) {
                    captionStartTagInTable(p, token);
                } else {
                    tokenInTable(p, token);
                }

                break;

            case 8:
                if (tn === $$4.COLGROUP) {
                    colgroupStartTagInTable(p, token);
                } else if (tn === $$4.TEMPLATE) {
                    startTagInHead(p, token);
                } else {
                    tokenInTable(p, token);
                }

                break;

            default:
                tokenInTable(p, token);
        }
    }

    function endTagInTable(p, token) {
        const tn = token.tagName;

        if (tn === $$4.TABLE) {
            if (p.openElements.hasInTableScope($$4.TABLE)) {
                p.openElements.popUntilTagNamePopped($$4.TABLE);
                p._resetInsertionMode();
            }
        } else if (tn === $$4.TEMPLATE) {
            endTagInHead(p, token);
        } else if (
            tn !== $$4.BODY &&
            tn !== $$4.CAPTION &&
            tn !== $$4.COL &&
            tn !== $$4.COLGROUP &&
            tn !== $$4.HTML &&
            tn !== $$4.TBODY &&
            tn !== $$4.TD &&
            tn !== $$4.TFOOT &&
            tn !== $$4.TH &&
            tn !== $$4.THEAD &&
            tn !== $$4.TR
        ) {
            tokenInTable(p, token);
        }
    }

    function tokenInTable(p, token) {
        const savedFosterParentingState = p.fosterParentingEnabled;

        p.fosterParentingEnabled = true;
        p._processTokenInBodyMode(token);
        p.fosterParentingEnabled = savedFosterParentingState;
    }

    // The "in table text" insertion mode
    //------------------------------------------------------------------
    function whitespaceCharacterInTableText(p, token) {
        p.pendingCharacterTokens.push(token);
    }

    function characterInTableText(p, token) {
        p.pendingCharacterTokens.push(token);
        p.hasNonWhitespacePendingCharacterToken = true;
    }

    function tokenInTableText(p, token) {
        let i = 0;

        if (p.hasNonWhitespacePendingCharacterToken) {
            for (; i < p.pendingCharacterTokens.length; i++) {
                tokenInTable(p, p.pendingCharacterTokens[i]);
            }
        } else {
            for (; i < p.pendingCharacterTokens.length; i++) {
                p._insertCharacters(p.pendingCharacterTokens[i]);
            }
        }

        p.insertionMode = p.originalInsertionMode;
        p._processToken(token);
    }

    // The "in caption" insertion mode
    //------------------------------------------------------------------
    function startTagInCaption(p, token) {
        const tn = token.tagName;

        if (
            tn === $$4.CAPTION ||
            tn === $$4.COL ||
            tn === $$4.COLGROUP ||
            tn === $$4.TBODY ||
            tn === $$4.TD ||
            tn === $$4.TFOOT ||
            tn === $$4.TH ||
            tn === $$4.THEAD ||
            tn === $$4.TR
        ) {
            if (p.openElements.hasInTableScope($$4.CAPTION)) {
                p.openElements.generateImpliedEndTags();
                p.openElements.popUntilTagNamePopped($$4.CAPTION);
                p.activeFormattingElements.clearToLastMarker();
                p.insertionMode = IN_TABLE_MODE;
                p._processToken(token);
            }
        } else {
            startTagInBody(p, token);
        }
    }

    function endTagInCaption(p, token) {
        const tn = token.tagName;

        if (tn === $$4.CAPTION || tn === $$4.TABLE) {
            if (p.openElements.hasInTableScope($$4.CAPTION)) {
                p.openElements.generateImpliedEndTags();
                p.openElements.popUntilTagNamePopped($$4.CAPTION);
                p.activeFormattingElements.clearToLastMarker();
                p.insertionMode = IN_TABLE_MODE;

                if (tn === $$4.TABLE) {
                    p._processToken(token);
                }
            }
        } else if (
            tn !== $$4.BODY &&
            tn !== $$4.COL &&
            tn !== $$4.COLGROUP &&
            tn !== $$4.HTML &&
            tn !== $$4.TBODY &&
            tn !== $$4.TD &&
            tn !== $$4.TFOOT &&
            tn !== $$4.TH &&
            tn !== $$4.THEAD &&
            tn !== $$4.TR
        ) {
            endTagInBody(p, token);
        }
    }

    // The "in column group" insertion mode
    //------------------------------------------------------------------
    function startTagInColumnGroup(p, token) {
        const tn = token.tagName;

        if (tn === $$4.HTML) {
            startTagInBody(p, token);
        } else if (tn === $$4.COL) {
            p._appendElement(token, NS$1.HTML);
            token.ackSelfClosing = true;
        } else if (tn === $$4.TEMPLATE) {
            startTagInHead(p, token);
        } else {
            tokenInColumnGroup(p, token);
        }
    }

    function endTagInColumnGroup(p, token) {
        const tn = token.tagName;

        if (tn === $$4.COLGROUP) {
            if (p.openElements.currentTagName === $$4.COLGROUP) {
                p.openElements.pop();
                p.insertionMode = IN_TABLE_MODE;
            }
        } else if (tn === $$4.TEMPLATE) {
            endTagInHead(p, token);
        } else if (tn !== $$4.COL) {
            tokenInColumnGroup(p, token);
        }
    }

    function tokenInColumnGroup(p, token) {
        if (p.openElements.currentTagName === $$4.COLGROUP) {
            p.openElements.pop();
            p.insertionMode = IN_TABLE_MODE;
            p._processToken(token);
        }
    }

    // The "in table body" insertion mode
    //------------------------------------------------------------------
    function startTagInTableBody(p, token) {
        const tn = token.tagName;

        if (tn === $$4.TR) {
            p.openElements.clearBackToTableBodyContext();
            p._insertElement(token, NS$1.HTML);
            p.insertionMode = IN_ROW_MODE;
        } else if (tn === $$4.TH || tn === $$4.TD) {
            p.openElements.clearBackToTableBodyContext();
            p._insertFakeElement($$4.TR);
            p.insertionMode = IN_ROW_MODE;
            p._processToken(token);
        } else if (
            tn === $$4.CAPTION ||
            tn === $$4.COL ||
            tn === $$4.COLGROUP ||
            tn === $$4.TBODY ||
            tn === $$4.TFOOT ||
            tn === $$4.THEAD
        ) {
            if (p.openElements.hasTableBodyContextInTableScope()) {
                p.openElements.clearBackToTableBodyContext();
                p.openElements.pop();
                p.insertionMode = IN_TABLE_MODE;
                p._processToken(token);
            }
        } else {
            startTagInTable(p, token);
        }
    }

    function endTagInTableBody(p, token) {
        const tn = token.tagName;

        if (tn === $$4.TBODY || tn === $$4.TFOOT || tn === $$4.THEAD) {
            if (p.openElements.hasInTableScope(tn)) {
                p.openElements.clearBackToTableBodyContext();
                p.openElements.pop();
                p.insertionMode = IN_TABLE_MODE;
            }
        } else if (tn === $$4.TABLE) {
            if (p.openElements.hasTableBodyContextInTableScope()) {
                p.openElements.clearBackToTableBodyContext();
                p.openElements.pop();
                p.insertionMode = IN_TABLE_MODE;
                p._processToken(token);
            }
        } else if (
            (tn !== $$4.BODY && tn !== $$4.CAPTION && tn !== $$4.COL && tn !== $$4.COLGROUP) ||
            (tn !== $$4.HTML && tn !== $$4.TD && tn !== $$4.TH && tn !== $$4.TR)
        ) {
            endTagInTable(p, token);
        }
    }

    // The "in row" insertion mode
    //------------------------------------------------------------------
    function startTagInRow(p, token) {
        const tn = token.tagName;

        if (tn === $$4.TH || tn === $$4.TD) {
            p.openElements.clearBackToTableRowContext();
            p._insertElement(token, NS$1.HTML);
            p.insertionMode = IN_CELL_MODE;
            p.activeFormattingElements.insertMarker();
        } else if (
            tn === $$4.CAPTION ||
            tn === $$4.COL ||
            tn === $$4.COLGROUP ||
            tn === $$4.TBODY ||
            tn === $$4.TFOOT ||
            tn === $$4.THEAD ||
            tn === $$4.TR
        ) {
            if (p.openElements.hasInTableScope($$4.TR)) {
                p.openElements.clearBackToTableRowContext();
                p.openElements.pop();
                p.insertionMode = IN_TABLE_BODY_MODE;
                p._processToken(token);
            }
        } else {
            startTagInTable(p, token);
        }
    }

    function endTagInRow(p, token) {
        const tn = token.tagName;

        if (tn === $$4.TR) {
            if (p.openElements.hasInTableScope($$4.TR)) {
                p.openElements.clearBackToTableRowContext();
                p.openElements.pop();
                p.insertionMode = IN_TABLE_BODY_MODE;
            }
        } else if (tn === $$4.TABLE) {
            if (p.openElements.hasInTableScope($$4.TR)) {
                p.openElements.clearBackToTableRowContext();
                p.openElements.pop();
                p.insertionMode = IN_TABLE_BODY_MODE;
                p._processToken(token);
            }
        } else if (tn === $$4.TBODY || tn === $$4.TFOOT || tn === $$4.THEAD) {
            if (p.openElements.hasInTableScope(tn) || p.openElements.hasInTableScope($$4.TR)) {
                p.openElements.clearBackToTableRowContext();
                p.openElements.pop();
                p.insertionMode = IN_TABLE_BODY_MODE;
                p._processToken(token);
            }
        } else if (
            (tn !== $$4.BODY && tn !== $$4.CAPTION && tn !== $$4.COL && tn !== $$4.COLGROUP) ||
            (tn !== $$4.HTML && tn !== $$4.TD && tn !== $$4.TH)
        ) {
            endTagInTable(p, token);
        }
    }

    // The "in cell" insertion mode
    //------------------------------------------------------------------
    function startTagInCell(p, token) {
        const tn = token.tagName;

        if (
            tn === $$4.CAPTION ||
            tn === $$4.COL ||
            tn === $$4.COLGROUP ||
            tn === $$4.TBODY ||
            tn === $$4.TD ||
            tn === $$4.TFOOT ||
            tn === $$4.TH ||
            tn === $$4.THEAD ||
            tn === $$4.TR
        ) {
            if (p.openElements.hasInTableScope($$4.TD) || p.openElements.hasInTableScope($$4.TH)) {
                p._closeTableCell();
                p._processToken(token);
            }
        } else {
            startTagInBody(p, token);
        }
    }

    function endTagInCell(p, token) {
        const tn = token.tagName;

        if (tn === $$4.TD || tn === $$4.TH) {
            if (p.openElements.hasInTableScope(tn)) {
                p.openElements.generateImpliedEndTags();
                p.openElements.popUntilTagNamePopped(tn);
                p.activeFormattingElements.clearToLastMarker();
                p.insertionMode = IN_ROW_MODE;
            }
        } else if (tn === $$4.TABLE || tn === $$4.TBODY || tn === $$4.TFOOT || tn === $$4.THEAD || tn === $$4.TR) {
            if (p.openElements.hasInTableScope(tn)) {
                p._closeTableCell();
                p._processToken(token);
            }
        } else if (tn !== $$4.BODY && tn !== $$4.CAPTION && tn !== $$4.COL && tn !== $$4.COLGROUP && tn !== $$4.HTML) {
            endTagInBody(p, token);
        }
    }

    // The "in select" insertion mode
    //------------------------------------------------------------------
    function startTagInSelect(p, token) {
        const tn = token.tagName;

        if (tn === $$4.HTML) {
            startTagInBody(p, token);
        } else if (tn === $$4.OPTION) {
            if (p.openElements.currentTagName === $$4.OPTION) {
                p.openElements.pop();
            }

            p._insertElement(token, NS$1.HTML);
        } else if (tn === $$4.OPTGROUP) {
            if (p.openElements.currentTagName === $$4.OPTION) {
                p.openElements.pop();
            }

            if (p.openElements.currentTagName === $$4.OPTGROUP) {
                p.openElements.pop();
            }

            p._insertElement(token, NS$1.HTML);
        } else if (tn === $$4.INPUT || tn === $$4.KEYGEN || tn === $$4.TEXTAREA || tn === $$4.SELECT) {
            if (p.openElements.hasInSelectScope($$4.SELECT)) {
                p.openElements.popUntilTagNamePopped($$4.SELECT);
                p._resetInsertionMode();

                if (tn !== $$4.SELECT) {
                    p._processToken(token);
                }
            }
        } else if (tn === $$4.SCRIPT || tn === $$4.TEMPLATE) {
            startTagInHead(p, token);
        }
    }

    function endTagInSelect(p, token) {
        const tn = token.tagName;

        if (tn === $$4.OPTGROUP) {
            const prevOpenElement = p.openElements.items[p.openElements.stackTop - 1];
            const prevOpenElementTn = prevOpenElement && p.treeAdapter.getTagName(prevOpenElement);

            if (p.openElements.currentTagName === $$4.OPTION && prevOpenElementTn === $$4.OPTGROUP) {
                p.openElements.pop();
            }

            if (p.openElements.currentTagName === $$4.OPTGROUP) {
                p.openElements.pop();
            }
        } else if (tn === $$4.OPTION) {
            if (p.openElements.currentTagName === $$4.OPTION) {
                p.openElements.pop();
            }
        } else if (tn === $$4.SELECT && p.openElements.hasInSelectScope($$4.SELECT)) {
            p.openElements.popUntilTagNamePopped($$4.SELECT);
            p._resetInsertionMode();
        } else if (tn === $$4.TEMPLATE) {
            endTagInHead(p, token);
        }
    }

    //12.2.5.4.17 The "in select in table" insertion mode
    //------------------------------------------------------------------
    function startTagInSelectInTable(p, token) {
        const tn = token.tagName;

        if (
            tn === $$4.CAPTION ||
            tn === $$4.TABLE ||
            tn === $$4.TBODY ||
            tn === $$4.TFOOT ||
            tn === $$4.THEAD ||
            tn === $$4.TR ||
            tn === $$4.TD ||
            tn === $$4.TH
        ) {
            p.openElements.popUntilTagNamePopped($$4.SELECT);
            p._resetInsertionMode();
            p._processToken(token);
        } else {
            startTagInSelect(p, token);
        }
    }

    function endTagInSelectInTable(p, token) {
        const tn = token.tagName;

        if (
            tn === $$4.CAPTION ||
            tn === $$4.TABLE ||
            tn === $$4.TBODY ||
            tn === $$4.TFOOT ||
            tn === $$4.THEAD ||
            tn === $$4.TR ||
            tn === $$4.TD ||
            tn === $$4.TH
        ) {
            if (p.openElements.hasInTableScope(tn)) {
                p.openElements.popUntilTagNamePopped($$4.SELECT);
                p._resetInsertionMode();
                p._processToken(token);
            }
        } else {
            endTagInSelect(p, token);
        }
    }

    // The "in template" insertion mode
    //------------------------------------------------------------------
    function startTagInTemplate(p, token) {
        const tn = token.tagName;

        if (
            tn === $$4.BASE ||
            tn === $$4.BASEFONT ||
            tn === $$4.BGSOUND ||
            tn === $$4.LINK ||
            tn === $$4.META ||
            tn === $$4.NOFRAMES ||
            tn === $$4.SCRIPT ||
            tn === $$4.STYLE ||
            tn === $$4.TEMPLATE ||
            tn === $$4.TITLE
        ) {
            startTagInHead(p, token);
        } else {
            const newInsertionMode = TEMPLATE_INSERTION_MODE_SWITCH_MAP[tn] || IN_BODY_MODE;

            p._popTmplInsertionMode();
            p._pushTmplInsertionMode(newInsertionMode);
            p.insertionMode = newInsertionMode;
            p._processToken(token);
        }
    }

    function endTagInTemplate(p, token) {
        if (token.tagName === $$4.TEMPLATE) {
            endTagInHead(p, token);
        }
    }

    function eofInTemplate(p, token) {
        if (p.openElements.tmplCount > 0) {
            p.openElements.popUntilTagNamePopped($$4.TEMPLATE);
            p.activeFormattingElements.clearToLastMarker();
            p._popTmplInsertionMode();
            p._resetInsertionMode();
            p._processToken(token);
        } else {
            p.stopped = true;
        }
    }

    // The "after body" insertion mode
    //------------------------------------------------------------------
    function startTagAfterBody(p, token) {
        if (token.tagName === $$4.HTML) {
            startTagInBody(p, token);
        } else {
            tokenAfterBody(p, token);
        }
    }

    function endTagAfterBody(p, token) {
        if (token.tagName === $$4.HTML) {
            if (!p.fragmentContext) {
                p.insertionMode = AFTER_AFTER_BODY_MODE;
            }
        } else {
            tokenAfterBody(p, token);
        }
    }

    function tokenAfterBody(p, token) {
        p.insertionMode = IN_BODY_MODE;
        p._processToken(token);
    }

    // The "in frameset" insertion mode
    //------------------------------------------------------------------
    function startTagInFrameset(p, token) {
        const tn = token.tagName;

        if (tn === $$4.HTML) {
            startTagInBody(p, token);
        } else if (tn === $$4.FRAMESET) {
            p._insertElement(token, NS$1.HTML);
        } else if (tn === $$4.FRAME) {
            p._appendElement(token, NS$1.HTML);
            token.ackSelfClosing = true;
        } else if (tn === $$4.NOFRAMES) {
            startTagInHead(p, token);
        }
    }

    function endTagInFrameset(p, token) {
        if (token.tagName === $$4.FRAMESET && !p.openElements.isRootHtmlElementCurrent()) {
            p.openElements.pop();

            if (!p.fragmentContext && p.openElements.currentTagName !== $$4.FRAMESET) {
                p.insertionMode = AFTER_FRAMESET_MODE;
            }
        }
    }

    // The "after frameset" insertion mode
    //------------------------------------------------------------------
    function startTagAfterFrameset(p, token) {
        const tn = token.tagName;

        if (tn === $$4.HTML) {
            startTagInBody(p, token);
        } else if (tn === $$4.NOFRAMES) {
            startTagInHead(p, token);
        }
    }

    function endTagAfterFrameset(p, token) {
        if (token.tagName === $$4.HTML) {
            p.insertionMode = AFTER_AFTER_FRAMESET_MODE;
        }
    }

    // The "after after body" insertion mode
    //------------------------------------------------------------------
    function startTagAfterAfterBody(p, token) {
        if (token.tagName === $$4.HTML) {
            startTagInBody(p, token);
        } else {
            tokenAfterAfterBody(p, token);
        }
    }

    function tokenAfterAfterBody(p, token) {
        p.insertionMode = IN_BODY_MODE;
        p._processToken(token);
    }

    // The "after after frameset" insertion mode
    //------------------------------------------------------------------
    function startTagAfterAfterFrameset(p, token) {
        const tn = token.tagName;

        if (tn === $$4.HTML) {
            startTagInBody(p, token);
        } else if (tn === $$4.NOFRAMES) {
            startTagInHead(p, token);
        }
    }

    // The rules for parsing tokens in foreign content
    //------------------------------------------------------------------
    function nullCharacterInForeignContent(p, token) {
        token.chars = unicode.REPLACEMENT_CHARACTER;
        p._insertCharacters(token);
    }

    function characterInForeignContent(p, token) {
        p._insertCharacters(token);
        p.framesetOk = false;
    }

    function startTagInForeignContent(p, token) {
        if (foreignContent.causesExit(token) && !p.fragmentContext) {
            while (
                p.treeAdapter.getNamespaceURI(p.openElements.current) !== NS$1.HTML &&
                !p._isIntegrationPoint(p.openElements.current)
            ) {
                p.openElements.pop();
            }

            p._processToken(token);
        } else {
            const current = p._getAdjustedCurrentElement();
            const currentNs = p.treeAdapter.getNamespaceURI(current);

            if (currentNs === NS$1.MATHML) {
                foreignContent.adjustTokenMathMLAttrs(token);
            } else if (currentNs === NS$1.SVG) {
                foreignContent.adjustTokenSVGTagName(token);
                foreignContent.adjustTokenSVGAttrs(token);
            }

            foreignContent.adjustTokenXMLAttrs(token);

            if (token.selfClosing) {
                p._appendElement(token, currentNs);
            } else {
                p._insertElement(token, currentNs);
            }

            token.ackSelfClosing = true;
        }
    }

    function endTagInForeignContent(p, token) {
        for (let i = p.openElements.stackTop; i > 0; i--) {
            const element = p.openElements.items[i];

            if (p.treeAdapter.getNamespaceURI(element) === NS$1.HTML) {
                p._processToken(token);
                break;
            }

            if (p.treeAdapter.getTagName(element).toLowerCase() === token.tagName) {
                p.openElements.popUntilElementPopped(element);
                break;
            }
        }
    }

    var immutable = extend$1;

    var hasOwnProperty = Object.prototype.hasOwnProperty;

    function extend$1() {
        var target = {};

        for (var i = 0; i < arguments.length; i++) {
            var source = arguments[i];

            for (var key in source) {
                if (hasOwnProperty.call(source, key)) {
                    target[key] = source[key];
                }
            }
        }

        return target
    }

    var schema = Schema;

    var proto$1 = Schema.prototype;

    proto$1.space = null;
    proto$1.normal = {};
    proto$1.property = {};

    function Schema(property, normal, space) {
      this.property = property;
      this.normal = normal;

      if (space) {
        this.space = space;
      }
    }

    var merge_1 = merge;

    function merge(definitions) {
      var length = definitions.length;
      var property = [];
      var normal = [];
      var index = -1;
      var info;
      var space;

      while (++index < length) {
        info = definitions[index];
        property.push(info.property);
        normal.push(info.normal);
        space = info.space;
      }

      return new schema(
        immutable.apply(null, property),
        immutable.apply(null, normal),
        space
      )
    }

    var normalize_1 = normalize$1;

    function normalize$1(value) {
      return value.toLowerCase()
    }

    var info$1 = Info;

    var proto$2 = Info.prototype;

    proto$2.space = null;
    proto$2.attribute = null;
    proto$2.property = null;
    proto$2.boolean = false;
    proto$2.booleanish = false;
    proto$2.overloadedBoolean = false;
    proto$2.number = false;
    proto$2.commaSeparated = false;
    proto$2.spaceSeparated = false;
    proto$2.commaOrSpaceSeparated = false;
    proto$2.mustUseProperty = false;
    proto$2.defined = false;

    function Info(property, attribute) {
      this.property = property;
      this.attribute = attribute;
    }

    var powers = 0;

    var boolean_1 = increment();
    var booleanish = increment();
    var overloadedBoolean = increment();
    var number = increment();
    var spaceSeparated = increment();
    var commaSeparated = increment();
    var commaOrSpaceSeparated = increment();

    function increment() {
      return Math.pow(2, ++powers)
    }

    var types = {
    	boolean: boolean_1,
    	booleanish: booleanish,
    	overloadedBoolean: overloadedBoolean,
    	number: number,
    	spaceSeparated: spaceSeparated,
    	commaSeparated: commaSeparated,
    	commaOrSpaceSeparated: commaOrSpaceSeparated
    };

    var definedInfo = DefinedInfo;

    DefinedInfo.prototype = new info$1();
    DefinedInfo.prototype.defined = true;

    var checks = [
      'boolean',
      'booleanish',
      'overloadedBoolean',
      'number',
      'commaSeparated',
      'spaceSeparated',
      'commaOrSpaceSeparated'
    ];
    var checksLength = checks.length;

    function DefinedInfo(property, attribute, mask, space) {
      var index = -1;
      var check;

      mark(this, 'space', space);

      info$1.call(this, property, attribute);

      while (++index < checksLength) {
        check = checks[index];
        mark(this, check, (mask & types[check]) === types[check]);
      }
    }

    function mark(values, key, value) {
      if (value) {
        values[key] = value;
      }
    }

    var create_1 = create;

    function create(definition) {
      var space = definition.space;
      var mustUseProperty = definition.mustUseProperty || [];
      var attributes = definition.attributes || {};
      var props = definition.properties;
      var transform = definition.transform;
      var property = {};
      var normal = {};
      var prop;
      var info;

      for (prop in props) {
        info = new definedInfo(
          prop,
          transform(attributes, prop),
          props[prop],
          space
        );

        if (mustUseProperty.indexOf(prop) !== -1) {
          info.mustUseProperty = true;
        }

        property[prop] = info;

        normal[normalize_1(prop)] = prop;
        normal[normalize_1(info.attribute)] = prop;
      }

      return new schema(property, normal, space)
    }

    var xlink = create_1({
      space: 'xlink',
      transform: xlinkTransform,
      properties: {
        xLinkActuate: null,
        xLinkArcRole: null,
        xLinkHref: null,
        xLinkRole: null,
        xLinkShow: null,
        xLinkTitle: null,
        xLinkType: null
      }
    });

    function xlinkTransform(_, prop) {
      return 'xlink:' + prop.slice(5).toLowerCase()
    }

    var xml = create_1({
      space: 'xml',
      transform: xmlTransform,
      properties: {
        xmlLang: null,
        xmlBase: null,
        xmlSpace: null
      }
    });

    function xmlTransform(_, prop) {
      return 'xml:' + prop.slice(3).toLowerCase()
    }

    var caseSensitiveTransform_1 = caseSensitiveTransform;

    function caseSensitiveTransform(attributes, attribute) {
      return attribute in attributes ? attributes[attribute] : attribute
    }

    var caseInsensitiveTransform_1 = caseInsensitiveTransform;

    function caseInsensitiveTransform(attributes, property) {
      return caseSensitiveTransform_1(attributes, property.toLowerCase())
    }

    var xmlns = create_1({
      space: 'xmlns',
      attributes: {
        xmlnsxlink: 'xmlns:xlink'
      },
      transform: caseInsensitiveTransform_1,
      properties: {
        xmlns: null,
        xmlnsXLink: null
      }
    });

    var booleanish$1 = types.booleanish;
    var number$1 = types.number;
    var spaceSeparated$1 = types.spaceSeparated;

    var aria = create_1({
      transform: ariaTransform,
      properties: {
        ariaActiveDescendant: null,
        ariaAtomic: booleanish$1,
        ariaAutoComplete: null,
        ariaBusy: booleanish$1,
        ariaChecked: booleanish$1,
        ariaColCount: number$1,
        ariaColIndex: number$1,
        ariaColSpan: number$1,
        ariaControls: spaceSeparated$1,
        ariaCurrent: null,
        ariaDescribedBy: spaceSeparated$1,
        ariaDetails: null,
        ariaDisabled: booleanish$1,
        ariaDropEffect: spaceSeparated$1,
        ariaErrorMessage: null,
        ariaExpanded: booleanish$1,
        ariaFlowTo: spaceSeparated$1,
        ariaGrabbed: booleanish$1,
        ariaHasPopup: null,
        ariaHidden: booleanish$1,
        ariaInvalid: null,
        ariaKeyShortcuts: null,
        ariaLabel: null,
        ariaLabelledBy: spaceSeparated$1,
        ariaLevel: number$1,
        ariaLive: null,
        ariaModal: booleanish$1,
        ariaMultiLine: booleanish$1,
        ariaMultiSelectable: booleanish$1,
        ariaOrientation: null,
        ariaOwns: spaceSeparated$1,
        ariaPlaceholder: null,
        ariaPosInSet: number$1,
        ariaPressed: booleanish$1,
        ariaReadOnly: booleanish$1,
        ariaRelevant: null,
        ariaRequired: booleanish$1,
        ariaRoleDescription: spaceSeparated$1,
        ariaRowCount: number$1,
        ariaRowIndex: number$1,
        ariaRowSpan: number$1,
        ariaSelected: booleanish$1,
        ariaSetSize: number$1,
        ariaSort: null,
        ariaValueMax: number$1,
        ariaValueMin: number$1,
        ariaValueNow: number$1,
        ariaValueText: null,
        role: null
      }
    });

    function ariaTransform(_, prop) {
      return prop === 'role' ? prop : 'aria-' + prop.slice(4).toLowerCase()
    }

    var boolean = types.boolean;
    var number$2 = types.number;
    var spaceSeparated$2 = types.spaceSeparated;
    var commaSeparated$1 = types.commaSeparated;
    var commaOrSpaceSeparated$1 = types.commaOrSpaceSeparated;

    var svg = create_1({
      space: 'svg',
      attributes: {
        accentHeight: 'accent-height',
        alignmentBaseline: 'alignment-baseline',
        arabicForm: 'arabic-form',
        baselineShift: 'baseline-shift',
        capHeight: 'cap-height',
        className: 'class',
        clipPath: 'clip-path',
        clipRule: 'clip-rule',
        colorInterpolation: 'color-interpolation',
        colorInterpolationFilters: 'color-interpolation-filters',
        colorProfile: 'color-profile',
        colorRendering: 'color-rendering',
        crossOrigin: 'crossorigin',
        dataType: 'datatype',
        dominantBaseline: 'dominant-baseline',
        enableBackground: 'enable-background',
        fillOpacity: 'fill-opacity',
        fillRule: 'fill-rule',
        floodColor: 'flood-color',
        floodOpacity: 'flood-opacity',
        fontFamily: 'font-family',
        fontSize: 'font-size',
        fontSizeAdjust: 'font-size-adjust',
        fontStretch: 'font-stretch',
        fontStyle: 'font-style',
        fontVariant: 'font-variant',
        fontWeight: 'font-weight',
        glyphName: 'glyph-name',
        glyphOrientationHorizontal: 'glyph-orientation-horizontal',
        glyphOrientationVertical: 'glyph-orientation-vertical',
        hrefLang: 'hreflang',
        horizAdvX: 'horiz-adv-x',
        horizOriginX: 'horiz-origin-x',
        horizOriginY: 'horiz-origin-y',
        imageRendering: 'image-rendering',
        letterSpacing: 'letter-spacing',
        lightingColor: 'lighting-color',
        markerEnd: 'marker-end',
        markerMid: 'marker-mid',
        markerStart: 'marker-start',
        navDown: 'nav-down',
        navDownLeft: 'nav-down-left',
        navDownRight: 'nav-down-right',
        navLeft: 'nav-left',
        navNext: 'nav-next',
        navPrev: 'nav-prev',
        navRight: 'nav-right',
        navUp: 'nav-up',
        navUpLeft: 'nav-up-left',
        navUpRight: 'nav-up-right',
        onAbort: 'onabort',
        onActivate: 'onactivate',
        onAfterPrint: 'onafterprint',
        onBeforePrint: 'onbeforeprint',
        onBegin: 'onbegin',
        onCancel: 'oncancel',
        onCanPlay: 'oncanplay',
        onCanPlayThrough: 'oncanplaythrough',
        onChange: 'onchange',
        onClick: 'onclick',
        onClose: 'onclose',
        onCopy: 'oncopy',
        onCueChange: 'oncuechange',
        onCut: 'oncut',
        onDblClick: 'ondblclick',
        onDrag: 'ondrag',
        onDragEnd: 'ondragend',
        onDragEnter: 'ondragenter',
        onDragExit: 'ondragexit',
        onDragLeave: 'ondragleave',
        onDragOver: 'ondragover',
        onDragStart: 'ondragstart',
        onDrop: 'ondrop',
        onDurationChange: 'ondurationchange',
        onEmptied: 'onemptied',
        onEnd: 'onend',
        onEnded: 'onended',
        onError: 'onerror',
        onFocus: 'onfocus',
        onFocusIn: 'onfocusin',
        onFocusOut: 'onfocusout',
        onHashChange: 'onhashchange',
        onInput: 'oninput',
        onInvalid: 'oninvalid',
        onKeyDown: 'onkeydown',
        onKeyPress: 'onkeypress',
        onKeyUp: 'onkeyup',
        onLoad: 'onload',
        onLoadedData: 'onloadeddata',
        onLoadedMetadata: 'onloadedmetadata',
        onLoadStart: 'onloadstart',
        onMessage: 'onmessage',
        onMouseDown: 'onmousedown',
        onMouseEnter: 'onmouseenter',
        onMouseLeave: 'onmouseleave',
        onMouseMove: 'onmousemove',
        onMouseOut: 'onmouseout',
        onMouseOver: 'onmouseover',
        onMouseUp: 'onmouseup',
        onMouseWheel: 'onmousewheel',
        onOffline: 'onoffline',
        onOnline: 'ononline',
        onPageHide: 'onpagehide',
        onPageShow: 'onpageshow',
        onPaste: 'onpaste',
        onPause: 'onpause',
        onPlay: 'onplay',
        onPlaying: 'onplaying',
        onPopState: 'onpopstate',
        onProgress: 'onprogress',
        onRateChange: 'onratechange',
        onRepeat: 'onrepeat',
        onReset: 'onreset',
        onResize: 'onresize',
        onScroll: 'onscroll',
        onSeeked: 'onseeked',
        onSeeking: 'onseeking',
        onSelect: 'onselect',
        onShow: 'onshow',
        onStalled: 'onstalled',
        onStorage: 'onstorage',
        onSubmit: 'onsubmit',
        onSuspend: 'onsuspend',
        onTimeUpdate: 'ontimeupdate',
        onToggle: 'ontoggle',
        onUnload: 'onunload',
        onVolumeChange: 'onvolumechange',
        onWaiting: 'onwaiting',
        onZoom: 'onzoom',
        overlinePosition: 'overline-position',
        overlineThickness: 'overline-thickness',
        paintOrder: 'paint-order',
        panose1: 'panose-1',
        pointerEvents: 'pointer-events',
        referrerPolicy: 'referrerpolicy',
        renderingIntent: 'rendering-intent',
        shapeRendering: 'shape-rendering',
        stopColor: 'stop-color',
        stopOpacity: 'stop-opacity',
        strikethroughPosition: 'strikethrough-position',
        strikethroughThickness: 'strikethrough-thickness',
        strokeDashArray: 'stroke-dasharray',
        strokeDashOffset: 'stroke-dashoffset',
        strokeLineCap: 'stroke-linecap',
        strokeLineJoin: 'stroke-linejoin',
        strokeMiterLimit: 'stroke-miterlimit',
        strokeOpacity: 'stroke-opacity',
        strokeWidth: 'stroke-width',
        tabIndex: 'tabindex',
        textAnchor: 'text-anchor',
        textDecoration: 'text-decoration',
        textRendering: 'text-rendering',
        typeOf: 'typeof',
        underlinePosition: 'underline-position',
        underlineThickness: 'underline-thickness',
        unicodeBidi: 'unicode-bidi',
        unicodeRange: 'unicode-range',
        unitsPerEm: 'units-per-em',
        vAlphabetic: 'v-alphabetic',
        vHanging: 'v-hanging',
        vIdeographic: 'v-ideographic',
        vMathematical: 'v-mathematical',
        vectorEffect: 'vector-effect',
        vertAdvY: 'vert-adv-y',
        vertOriginX: 'vert-origin-x',
        vertOriginY: 'vert-origin-y',
        wordSpacing: 'word-spacing',
        writingMode: 'writing-mode',
        xHeight: 'x-height',
        // These were camelcased in Tiny. Now lowercased in SVG 2
        playbackOrder: 'playbackorder',
        timelineBegin: 'timelinebegin'
      },
      transform: caseSensitiveTransform_1,
      properties: {
        about: commaOrSpaceSeparated$1,
        accentHeight: number$2,
        accumulate: null,
        additive: null,
        alignmentBaseline: null,
        alphabetic: number$2,
        amplitude: number$2,
        arabicForm: null,
        ascent: number$2,
        attributeName: null,
        attributeType: null,
        azimuth: number$2,
        bandwidth: null,
        baselineShift: null,
        baseFrequency: null,
        baseProfile: null,
        bbox: null,
        begin: null,
        bias: number$2,
        by: null,
        calcMode: null,
        capHeight: number$2,
        className: spaceSeparated$2,
        clip: null,
        clipPath: null,
        clipPathUnits: null,
        clipRule: null,
        color: null,
        colorInterpolation: null,
        colorInterpolationFilters: null,
        colorProfile: null,
        colorRendering: null,
        content: null,
        contentScriptType: null,
        contentStyleType: null,
        crossOrigin: null,
        cursor: null,
        cx: null,
        cy: null,
        d: null,
        dataType: null,
        defaultAction: null,
        descent: number$2,
        diffuseConstant: number$2,
        direction: null,
        display: null,
        dur: null,
        divisor: number$2,
        dominantBaseline: null,
        download: boolean,
        dx: null,
        dy: null,
        edgeMode: null,
        editable: null,
        elevation: number$2,
        enableBackground: null,
        end: null,
        event: null,
        exponent: number$2,
        externalResourcesRequired: null,
        fill: null,
        fillOpacity: number$2,
        fillRule: null,
        filter: null,
        filterRes: null,
        filterUnits: null,
        floodColor: null,
        floodOpacity: null,
        focusable: null,
        focusHighlight: null,
        fontFamily: null,
        fontSize: null,
        fontSizeAdjust: null,
        fontStretch: null,
        fontStyle: null,
        fontVariant: null,
        fontWeight: null,
        format: null,
        fr: null,
        from: null,
        fx: null,
        fy: null,
        g1: commaSeparated$1,
        g2: commaSeparated$1,
        glyphName: commaSeparated$1,
        glyphOrientationHorizontal: null,
        glyphOrientationVertical: null,
        glyphRef: null,
        gradientTransform: null,
        gradientUnits: null,
        handler: null,
        hanging: number$2,
        hatchContentUnits: null,
        hatchUnits: null,
        height: null,
        href: null,
        hrefLang: null,
        horizAdvX: number$2,
        horizOriginX: number$2,
        horizOriginY: number$2,
        id: null,
        ideographic: number$2,
        imageRendering: null,
        initialVisibility: null,
        in: null,
        in2: null,
        intercept: number$2,
        k: number$2,
        k1: number$2,
        k2: number$2,
        k3: number$2,
        k4: number$2,
        kernelMatrix: commaOrSpaceSeparated$1,
        kernelUnitLength: null,
        keyPoints: null, // SEMI_COLON_SEPARATED
        keySplines: null, // SEMI_COLON_SEPARATED
        keyTimes: null, // SEMI_COLON_SEPARATED
        kerning: null,
        lang: null,
        lengthAdjust: null,
        letterSpacing: null,
        lightingColor: null,
        limitingConeAngle: number$2,
        local: null,
        markerEnd: null,
        markerMid: null,
        markerStart: null,
        markerHeight: null,
        markerUnits: null,
        markerWidth: null,
        mask: null,
        maskContentUnits: null,
        maskUnits: null,
        mathematical: null,
        max: null,
        media: null,
        mediaCharacterEncoding: null,
        mediaContentEncodings: null,
        mediaSize: number$2,
        mediaTime: null,
        method: null,
        min: null,
        mode: null,
        name: null,
        navDown: null,
        navDownLeft: null,
        navDownRight: null,
        navLeft: null,
        navNext: null,
        navPrev: null,
        navRight: null,
        navUp: null,
        navUpLeft: null,
        navUpRight: null,
        numOctaves: null,
        observer: null,
        offset: null,
        onAbort: null,
        onActivate: null,
        onAfterPrint: null,
        onBeforePrint: null,
        onBegin: null,
        onCancel: null,
        onCanPlay: null,
        onCanPlayThrough: null,
        onChange: null,
        onClick: null,
        onClose: null,
        onCopy: null,
        onCueChange: null,
        onCut: null,
        onDblClick: null,
        onDrag: null,
        onDragEnd: null,
        onDragEnter: null,
        onDragExit: null,
        onDragLeave: null,
        onDragOver: null,
        onDragStart: null,
        onDrop: null,
        onDurationChange: null,
        onEmptied: null,
        onEnd: null,
        onEnded: null,
        onError: null,
        onFocus: null,
        onFocusIn: null,
        onFocusOut: null,
        onHashChange: null,
        onInput: null,
        onInvalid: null,
        onKeyDown: null,
        onKeyPress: null,
        onKeyUp: null,
        onLoad: null,
        onLoadedData: null,
        onLoadedMetadata: null,
        onLoadStart: null,
        onMessage: null,
        onMouseDown: null,
        onMouseEnter: null,
        onMouseLeave: null,
        onMouseMove: null,
        onMouseOut: null,
        onMouseOver: null,
        onMouseUp: null,
        onMouseWheel: null,
        onOffline: null,
        onOnline: null,
        onPageHide: null,
        onPageShow: null,
        onPaste: null,
        onPause: null,
        onPlay: null,
        onPlaying: null,
        onPopState: null,
        onProgress: null,
        onRateChange: null,
        onRepeat: null,
        onReset: null,
        onResize: null,
        onScroll: null,
        onSeeked: null,
        onSeeking: null,
        onSelect: null,
        onShow: null,
        onStalled: null,
        onStorage: null,
        onSubmit: null,
        onSuspend: null,
        onTimeUpdate: null,
        onToggle: null,
        onUnload: null,
        onVolumeChange: null,
        onWaiting: null,
        onZoom: null,
        opacity: null,
        operator: null,
        order: null,
        orient: null,
        orientation: null,
        origin: null,
        overflow: null,
        overlay: null,
        overlinePosition: number$2,
        overlineThickness: number$2,
        paintOrder: null,
        panose1: null,
        path: null,
        pathLength: number$2,
        patternContentUnits: null,
        patternTransform: null,
        patternUnits: null,
        phase: null,
        ping: spaceSeparated$2,
        pitch: null,
        playbackOrder: null,
        pointerEvents: null,
        points: null,
        pointsAtX: number$2,
        pointsAtY: number$2,
        pointsAtZ: number$2,
        preserveAlpha: null,
        preserveAspectRatio: null,
        primitiveUnits: null,
        propagate: null,
        property: commaOrSpaceSeparated$1,
        r: null,
        radius: null,
        referrerPolicy: null,
        refX: null,
        refY: null,
        rel: commaOrSpaceSeparated$1,
        rev: commaOrSpaceSeparated$1,
        renderingIntent: null,
        repeatCount: null,
        repeatDur: null,
        requiredExtensions: commaOrSpaceSeparated$1,
        requiredFeatures: commaOrSpaceSeparated$1,
        requiredFonts: commaOrSpaceSeparated$1,
        requiredFormats: commaOrSpaceSeparated$1,
        resource: null,
        restart: null,
        result: null,
        rotate: null,
        rx: null,
        ry: null,
        scale: null,
        seed: null,
        shapeRendering: null,
        side: null,
        slope: null,
        snapshotTime: null,
        specularConstant: number$2,
        specularExponent: number$2,
        spreadMethod: null,
        spacing: null,
        startOffset: null,
        stdDeviation: null,
        stemh: null,
        stemv: null,
        stitchTiles: null,
        stopColor: null,
        stopOpacity: null,
        strikethroughPosition: number$2,
        strikethroughThickness: number$2,
        string: null,
        stroke: null,
        strokeDashArray: commaOrSpaceSeparated$1,
        strokeDashOffset: null,
        strokeLineCap: null,
        strokeLineJoin: null,
        strokeMiterLimit: number$2,
        strokeOpacity: number$2,
        strokeWidth: null,
        style: null,
        surfaceScale: number$2,
        syncBehavior: null,
        syncBehaviorDefault: null,
        syncMaster: null,
        syncTolerance: null,
        syncToleranceDefault: null,
        systemLanguage: commaOrSpaceSeparated$1,
        tabIndex: number$2,
        tableValues: null,
        target: null,
        targetX: number$2,
        targetY: number$2,
        textAnchor: null,
        textDecoration: null,
        textRendering: null,
        textLength: null,
        timelineBegin: null,
        title: null,
        transformBehavior: null,
        type: null,
        typeOf: commaOrSpaceSeparated$1,
        to: null,
        transform: null,
        u1: null,
        u2: null,
        underlinePosition: number$2,
        underlineThickness: number$2,
        unicode: null,
        unicodeBidi: null,
        unicodeRange: null,
        unitsPerEm: number$2,
        values: null,
        vAlphabetic: number$2,
        vMathematical: number$2,
        vectorEffect: null,
        vHanging: number$2,
        vIdeographic: number$2,
        version: null,
        vertAdvY: number$2,
        vertOriginX: number$2,
        vertOriginY: number$2,
        viewBox: null,
        viewTarget: null,
        visibility: null,
        width: null,
        widths: null,
        wordSpacing: null,
        writingMode: null,
        x: null,
        x1: null,
        x2: null,
        xChannelSelector: null,
        xHeight: number$2,
        y: null,
        y1: null,
        y2: null,
        yChannelSelector: null,
        z: null,
        zoomAndPan: null
      }
    });

    var svg_1 = merge_1([xml, xlink, xmlns, aria, svg]);

    var caseSensitive = [
    	"altGlyph",
    	"altGlyphDef",
    	"altGlyphItem",
    	"animateColor",
    	"animateMotion",
    	"animateTransform",
    	"clipPath",
    	"feBlend",
    	"feColorMatrix",
    	"feComponentTransfer",
    	"feComposite",
    	"feConvolveMatrix",
    	"feDiffuseLighting",
    	"feDisplacementMap",
    	"feDistantLight",
    	"feDropShadow",
    	"feFlood",
    	"feFuncA",
    	"feFuncB",
    	"feFuncG",
    	"feFuncR",
    	"feGaussianBlur",
    	"feImage",
    	"feMerge",
    	"feMergeNode",
    	"feMorphology",
    	"feOffset",
    	"fePointLight",
    	"feSpecularLighting",
    	"feSpotLight",
    	"feTile",
    	"feTurbulence",
    	"foreignObject",
    	"glyphRef",
    	"linearGradient",
    	"radialGradient",
    	"solidColor",
    	"textArea",
    	"textPath"
    ];

    var data = 'data';

    var find_1 = find;

    var valid = /^data[-\w.:]+$/i;
    var dash = /-[a-z]/g;
    var cap = /[A-Z]/g;

    function find(schema, value) {
      var normal = normalize_1(value);
      var prop = value;
      var Type = info$1;

      if (normal in schema.normal) {
        return schema.property[schema.normal[normal]]
      }

      if (normal.length > 4 && normal.slice(0, 4) === data && valid.test(value)) {
        // Attribute or property.
        if (value.charAt(4) === '-') {
          prop = datasetToProperty(value);
        } else {
          value = datasetToAttribute(value);
        }

        Type = definedInfo;
      }

      return new Type(prop, value)
    }

    function datasetToProperty(attribute) {
      var value = attribute.slice(5).replace(dash, camelcase);
      return data + value.charAt(0).toUpperCase() + value.slice(1)
    }

    function datasetToAttribute(property) {
      var value = property.slice(4);

      if (dash.test(value)) {
        return property
      }

      value = value.replace(cap, kebab);

      if (value.charAt(0) !== '-') {
        value = '-' + value;
      }

      return data + value
    }

    function kebab($0) {
      return '-' + $0.toLowerCase()
    }

    function camelcase($0) {
      return $0.charAt(1).toUpperCase()
    }

    var hastUtilParseSelector = parse$2;

    var search$1 = /[#.]/g;

    // Create a hast element from a simple CSS selector.
    function parse$2(selector, defaultTagName) {
      var value = selector || '';
      var name = defaultTagName || 'div';
      var props = {};
      var start = 0;
      var subvalue;
      var previous;
      var match;

      while (start < value.length) {
        search$1.lastIndex = start;
        match = search$1.exec(value);
        subvalue = value.slice(start, match ? match.index : value.length);

        if (subvalue) {
          if (!previous) {
            name = subvalue;
          } else if (previous === '#') {
            props.id = subvalue;
          } else if (props.className) {
            props.className.push(subvalue);
          } else {
            props.className = [subvalue];
          }

          start += subvalue.length;
        }

        if (match) {
          previous = match[0];
          start++;
        }
      }

      return {type: 'element', tagName: name, properties: props, children: []}
    }

    var parse_1$1 = parse$3;
    var stringify_1 = stringify$1;

    var empty$1 = '';
    var space = ' ';
    var whiteSpace = /[ \t\n\r\f]+/g;

    function parse$3(value) {
      var input = String(value || empty$1).trim();
      return input === empty$1 ? [] : input.split(whiteSpace)
    }

    function stringify$1(values) {
      return values.join(space).trim()
    }

    var spaceSeparatedTokens = {
    	parse: parse_1$1,
    	stringify: stringify_1
    };

    var parse_1$2 = parse$4;
    var stringify_1$1 = stringify$2;

    var comma = ',';
    var space$1 = ' ';
    var empty$2 = '';

    // Parse comma-separated tokens to an array.
    function parse$4(value) {
      var values = [];
      var input = String(value || empty$2);
      var index = input.indexOf(comma);
      var lastIndex = 0;
      var end = false;
      var val;

      while (!end) {
        if (index === -1) {
          index = input.length;
          end = true;
        }

        val = input.slice(lastIndex, index).trim();

        if (val || !end) {
          values.push(val);
        }

        lastIndex = index + 1;
        index = input.indexOf(comma, lastIndex);
      }

      return values
    }

    // Compile an array to comma-separated tokens.
    // `options.padLeft` (default: `true`) pads a space left of each token, and
    // `options.padRight` (default: `false`) pads a space to the right of each token.
    function stringify$2(values, options) {
      var settings = options || {};
      var left = settings.padLeft === false ? empty$2 : space$1;
      var right = settings.padRight ? space$1 : empty$2;

      // Ensure the last empty entry is seen.
      if (values[values.length - 1] === empty$2) {
        values = values.concat(empty$2);
      }

      return values.join(right + comma + left).trim()
    }

    var commaSeparatedTokens = {
    	parse: parse_1$2,
    	stringify: stringify_1$1
    };

    var spaces = spaceSeparatedTokens.parse;
    var commas = commaSeparatedTokens.parse;

    var factory_1 = factory$2;

    var own$7 = {}.hasOwnProperty;

    function factory$2(schema, defaultTagName, caseSensitive) {
      var adjust = caseSensitive ? createAdjustMap(caseSensitive) : null;

      return h

      // Hyperscript compatible DSL for creating virtual hast trees.
      function h(selector, properties) {
        var node = hastUtilParseSelector(selector, defaultTagName);
        var children = Array.prototype.slice.call(arguments, 2);
        var name = node.tagName.toLowerCase();
        var property;

        node.tagName = adjust && own$7.call(adjust, name) ? adjust[name] : name;

        if (properties && isChildren(properties, node)) {
          children.unshift(properties);
          properties = null;
        }

        if (properties) {
          for (property in properties) {
            addProperty(node.properties, property, properties[property]);
          }
        }

        addChild(node.children, children);

        if (node.tagName === 'template') {
          node.content = {type: 'root', children: node.children};
          node.children = [];
        }

        return node
      }

      function addProperty(properties, key, value) {
        var info;
        var property;
        var result;

        // Ignore nullish and NaN values.
        if (value === null || value === undefined || value !== value) {
          return
        }

        info = find_1(schema, key);
        property = info.property;
        result = value;

        // Handle list values.
        if (typeof result === 'string') {
          if (info.spaceSeparated) {
            result = spaces(result);
          } else if (info.commaSeparated) {
            result = commas(result);
          } else if (info.commaOrSpaceSeparated) {
            result = spaces(commas(result).join(' '));
          }
        }

        // Accept `object` on style.
        if (property === 'style' && typeof value !== 'string') {
          result = style(result);
        }

        // Class-names (which can be added both on the `selector` and here).
        if (property === 'className' && properties.className) {
          result = properties.className.concat(result);
        }

        properties[property] = parsePrimitives(info, property, result);
      }
    }

    function isChildren(value, node) {
      return (
        typeof value === 'string' ||
        'length' in value ||
        isNode(node.tagName, value)
      )
    }

    function isNode(tagName, value) {
      var type = value.type;

      if (tagName === 'input' || !type || typeof type !== 'string') {
        return false
      }

      if (typeof value.children === 'object' && 'length' in value.children) {
        return true
      }

      type = type.toLowerCase();

      if (tagName === 'button') {
        return (
          type !== 'menu' &&
          type !== 'submit' &&
          type !== 'reset' &&
          type !== 'button'
        )
      }

      return 'value' in value
    }

    function addChild(nodes, value) {
      var index;
      var length;

      if (typeof value === 'string' || typeof value === 'number') {
        nodes.push({type: 'text', value: String(value)});
        return
      }

      if (typeof value === 'object' && 'length' in value) {
        index = -1;
        length = value.length;

        while (++index < length) {
          addChild(nodes, value[index]);
        }

        return
      }

      if (typeof value !== 'object' || !('type' in value)) {
        throw new Error('Expected node, nodes, or string, got `' + value + '`')
      }

      nodes.push(value);
    }

    // Parse a (list of) primitives.
    function parsePrimitives(info, name, value) {
      var index;
      var length;
      var result;

      if (typeof value !== 'object' || !('length' in value)) {
        return parsePrimitive(info, name, value)
      }

      length = value.length;
      index = -1;
      result = [];

      while (++index < length) {
        result[index] = parsePrimitive(info, name, value[index]);
      }

      return result
    }

    // Parse a single primitives.
    function parsePrimitive(info, name, value) {
      var result = value;

      if (info.number || info.positiveNumber) {
        if (!isNaN(result) && result !== '') {
          result = Number(result);
        }
      } else if (info.boolean || info.overloadedBoolean) {
        // Accept `boolean` and `string`.
        if (
          typeof result === 'string' &&
          (result === '' || normalize_1(value) === normalize_1(name))
        ) {
          result = true;
        }
      }

      return result
    }

    function style(value) {
      var result = [];
      var key;

      for (key in value) {
        result.push([key, value[key]].join(': '));
      }

      return result.join('; ')
    }

    function createAdjustMap(values) {
      var length = values.length;
      var index = -1;
      var result = {};
      var value;

      while (++index < length) {
        value = values[index];
        result[value.toLowerCase()] = value;
      }

      return result
    }

    var svg$1 = factory_1(svg_1, 'g', caseSensitive);
    svg$1.displayName = 'svg';

    var svg_1$1 = svg$1;

    var boolean$1 = types.boolean;
    var overloadedBoolean$1 = types.overloadedBoolean;
    var booleanish$2 = types.booleanish;
    var number$3 = types.number;
    var spaceSeparated$3 = types.spaceSeparated;
    var commaSeparated$2 = types.commaSeparated;

    var html$2 = create_1({
      space: 'html',
      attributes: {
        acceptcharset: 'accept-charset',
        classname: 'class',
        htmlfor: 'for',
        httpequiv: 'http-equiv'
      },
      transform: caseInsensitiveTransform_1,
      mustUseProperty: ['checked', 'multiple', 'muted', 'selected'],
      properties: {
        // Standard Properties.
        abbr: null,
        accept: commaSeparated$2,
        acceptCharset: spaceSeparated$3,
        accessKey: spaceSeparated$3,
        action: null,
        allow: null,
        allowFullScreen: boolean$1,
        allowPaymentRequest: boolean$1,
        allowUserMedia: boolean$1,
        alt: null,
        as: null,
        async: boolean$1,
        autoCapitalize: null,
        autoComplete: spaceSeparated$3,
        autoFocus: boolean$1,
        autoPlay: boolean$1,
        capture: boolean$1,
        charSet: null,
        checked: boolean$1,
        cite: null,
        className: spaceSeparated$3,
        cols: number$3,
        colSpan: null,
        content: null,
        contentEditable: booleanish$2,
        controls: boolean$1,
        controlsList: spaceSeparated$3,
        coords: number$3 | commaSeparated$2,
        crossOrigin: null,
        data: null,
        dateTime: null,
        decoding: null,
        default: boolean$1,
        defer: boolean$1,
        dir: null,
        dirName: null,
        disabled: boolean$1,
        download: overloadedBoolean$1,
        draggable: booleanish$2,
        encType: null,
        enterKeyHint: null,
        form: null,
        formAction: null,
        formEncType: null,
        formMethod: null,
        formNoValidate: boolean$1,
        formTarget: null,
        headers: spaceSeparated$3,
        height: number$3,
        hidden: boolean$1,
        high: number$3,
        href: null,
        hrefLang: null,
        htmlFor: spaceSeparated$3,
        httpEquiv: spaceSeparated$3,
        id: null,
        imageSizes: null,
        imageSrcSet: commaSeparated$2,
        inputMode: null,
        integrity: null,
        is: null,
        isMap: boolean$1,
        itemId: null,
        itemProp: spaceSeparated$3,
        itemRef: spaceSeparated$3,
        itemScope: boolean$1,
        itemType: spaceSeparated$3,
        kind: null,
        label: null,
        lang: null,
        language: null,
        list: null,
        loading: null,
        loop: boolean$1,
        low: number$3,
        manifest: null,
        max: null,
        maxLength: number$3,
        media: null,
        method: null,
        min: null,
        minLength: number$3,
        multiple: boolean$1,
        muted: boolean$1,
        name: null,
        nonce: null,
        noModule: boolean$1,
        noValidate: boolean$1,
        onAbort: null,
        onAfterPrint: null,
        onAuxClick: null,
        onBeforePrint: null,
        onBeforeUnload: null,
        onBlur: null,
        onCancel: null,
        onCanPlay: null,
        onCanPlayThrough: null,
        onChange: null,
        onClick: null,
        onClose: null,
        onContextMenu: null,
        onCopy: null,
        onCueChange: null,
        onCut: null,
        onDblClick: null,
        onDrag: null,
        onDragEnd: null,
        onDragEnter: null,
        onDragExit: null,
        onDragLeave: null,
        onDragOver: null,
        onDragStart: null,
        onDrop: null,
        onDurationChange: null,
        onEmptied: null,
        onEnded: null,
        onError: null,
        onFocus: null,
        onFormData: null,
        onHashChange: null,
        onInput: null,
        onInvalid: null,
        onKeyDown: null,
        onKeyPress: null,
        onKeyUp: null,
        onLanguageChange: null,
        onLoad: null,
        onLoadedData: null,
        onLoadedMetadata: null,
        onLoadEnd: null,
        onLoadStart: null,
        onMessage: null,
        onMessageError: null,
        onMouseDown: null,
        onMouseEnter: null,
        onMouseLeave: null,
        onMouseMove: null,
        onMouseOut: null,
        onMouseOver: null,
        onMouseUp: null,
        onOffline: null,
        onOnline: null,
        onPageHide: null,
        onPageShow: null,
        onPaste: null,
        onPause: null,
        onPlay: null,
        onPlaying: null,
        onPopState: null,
        onProgress: null,
        onRateChange: null,
        onRejectionHandled: null,
        onReset: null,
        onResize: null,
        onScroll: null,
        onSecurityPolicyViolation: null,
        onSeeked: null,
        onSeeking: null,
        onSelect: null,
        onSlotChange: null,
        onStalled: null,
        onStorage: null,
        onSubmit: null,
        onSuspend: null,
        onTimeUpdate: null,
        onToggle: null,
        onUnhandledRejection: null,
        onUnload: null,
        onVolumeChange: null,
        onWaiting: null,
        onWheel: null,
        open: boolean$1,
        optimum: number$3,
        pattern: null,
        ping: spaceSeparated$3,
        placeholder: null,
        playsInline: boolean$1,
        poster: null,
        preload: null,
        readOnly: boolean$1,
        referrerPolicy: null,
        rel: spaceSeparated$3,
        required: boolean$1,
        reversed: boolean$1,
        rows: number$3,
        rowSpan: number$3,
        sandbox: spaceSeparated$3,
        scope: null,
        scoped: boolean$1,
        seamless: boolean$1,
        selected: boolean$1,
        shape: null,
        size: number$3,
        sizes: null,
        slot: null,
        span: number$3,
        spellCheck: booleanish$2,
        src: null,
        srcDoc: null,
        srcLang: null,
        srcSet: commaSeparated$2,
        start: number$3,
        step: null,
        style: null,
        tabIndex: number$3,
        target: null,
        title: null,
        translate: null,
        type: null,
        typeMustMatch: boolean$1,
        useMap: null,
        value: booleanish$2,
        width: number$3,
        wrap: null,

        // Legacy.
        // See: https://html.spec.whatwg.org/#other-elements,-attributes-and-apis
        align: null, // Several. Use CSS `text-align` instead,
        aLink: null, // `<body>`. Use CSS `a:active {color}` instead
        archive: spaceSeparated$3, // `<object>`. List of URIs to archives
        axis: null, // `<td>` and `<th>`. Use `scope` on `<th>`
        background: null, // `<body>`. Use CSS `background-image` instead
        bgColor: null, // `<body>` and table elements. Use CSS `background-color` instead
        border: number$3, // `<table>`. Use CSS `border-width` instead,
        borderColor: null, // `<table>`. Use CSS `border-color` instead,
        bottomMargin: number$3, // `<body>`
        cellPadding: null, // `<table>`
        cellSpacing: null, // `<table>`
        char: null, // Several table elements. When `align=char`, sets the character to align on
        charOff: null, // Several table elements. When `char`, offsets the alignment
        classId: null, // `<object>`
        clear: null, // `<br>`. Use CSS `clear` instead
        code: null, // `<object>`
        codeBase: null, // `<object>`
        codeType: null, // `<object>`
        color: null, // `<font>` and `<hr>`. Use CSS instead
        compact: boolean$1, // Lists. Use CSS to reduce space between items instead
        declare: boolean$1, // `<object>`
        event: null, // `<script>`
        face: null, // `<font>`. Use CSS instead
        frame: null, // `<table>`
        frameBorder: null, // `<iframe>`. Use CSS `border` instead
        hSpace: number$3, // `<img>` and `<object>`
        leftMargin: number$3, // `<body>`
        link: null, // `<body>`. Use CSS `a:link {color: *}` instead
        longDesc: null, // `<frame>`, `<iframe>`, and `<img>`. Use an `<a>`
        lowSrc: null, // `<img>`. Use a `<picture>`
        marginHeight: number$3, // `<body>`
        marginWidth: number$3, // `<body>`
        noResize: boolean$1, // `<frame>`
        noHref: boolean$1, // `<area>`. Use no href instead of an explicit `nohref`
        noShade: boolean$1, // `<hr>`. Use background-color and height instead of borders
        noWrap: boolean$1, // `<td>` and `<th>`
        object: null, // `<applet>`
        profile: null, // `<head>`
        prompt: null, // `<isindex>`
        rev: null, // `<link>`
        rightMargin: number$3, // `<body>`
        rules: null, // `<table>`
        scheme: null, // `<meta>`
        scrolling: booleanish$2, // `<frame>`. Use overflow in the child context
        standby: null, // `<object>`
        summary: null, // `<table>`
        text: null, // `<body>`. Use CSS `color` instead
        topMargin: number$3, // `<body>`
        valueType: null, // `<param>`
        version: null, // `<html>`. Use a doctype.
        vAlign: null, // Several. Use CSS `vertical-align` instead
        vLink: null, // `<body>`. Use CSS `a:visited {color}` instead
        vSpace: number$3, // `<img>` and `<object>`

        // Non-standard Properties.
        allowTransparency: null,
        autoCorrect: null,
        autoSave: null,
        disablePictureInPicture: boolean$1,
        disableRemotePlayback: boolean$1,
        prefix: null,
        property: null,
        results: number$3,
        security: null,
        unselectable: null
      }
    });

    var html_1$1 = merge_1([xml, xlink, xmlns, aria, html$2]);

    var html$3 = factory_1(html_1$1, 'div');
    html$3.displayName = 'html';

    var html_1$2 = html$3;

    var hastscript = html_1$2;

    var vfileLocation = factory$3;

    function factory$3(file) {
      var value = String(file);
      var indices = [];
      var search = /\r?\n|\r/g;

      while (search.exec(value)) {
        indices.push(search.lastIndex);
      }

      indices.push(value.length + 1);

      return {
        toPoint: offsetToPoint,
        toPosition: offsetToPoint,
        toOffset: pointToOffset
      }

      // Get the line and column-based `point` for `offset` in the bound indices.
      function offsetToPoint(offset) {
        var index = -1;

        if (offset > -1 && offset < indices[indices.length - 1]) {
          while (++index < indices.length) {
            if (indices[index] > offset) {
              return {
                line: index + 1,
                column: offset - (indices[index - 1] || 0) + 1,
                offset: offset
              }
            }
          }
        }

        return {}
      }

      // Get the `offset` for a line and column-based `point` in the bound
      // indices.
      function pointToOffset(point) {
        var line = point && point.line;
        var column = point && point.column;
        var offset;

        if (!isNaN(line) && !isNaN(column) && line - 1 in indices) {
          offset = (indices[line - 2] || 0) + column - 1 || 0;
        }

        return offset > -1 && offset < indices[indices.length - 1] ? offset : -1
      }
    }

    var html$4 = "http://www.w3.org/1999/xhtml";
    var mathml = "http://www.w3.org/1998/Math/MathML";
    var svg$2 = "http://www.w3.org/2000/svg";
    var xlink$1 = "http://www.w3.org/1999/xlink";
    var xml$1 = "http://www.w3.org/XML/1998/namespace";
    var xmlns$1 = "http://www.w3.org/2000/xmlns/";
    var ns = {
    	html: html$4,
    	mathml: mathml,
    	svg: svg$2,
    	xlink: xlink$1,
    	xml: xml$1,
    	xmlns: xmlns$1
    };

    var hastUtilFromParse5 = wrapper;

    var own$8 = {}.hasOwnProperty;

    // Handlers.
    var map = {
      '#document': root$1,
      '#document-fragment': root$1,
      '#text': text$3,
      '#comment': comment,
      '#documentType': doctype$1
    };

    // Wrapper to normalise options.
    function wrapper(ast, options) {
      var settings = options || {};
      var file;

      if (settings.messages) {
        file = settings;
        settings = {};
      } else {
        file = settings.file;
      }

      return transform(ast, {
        schema: settings.space === 'svg' ? svg_1 : html_1$1,
        file: file,
        verbose: settings.verbose
      })
    }

    // Transform a node.
    function transform(ast, config) {
      var schema = config.schema;
      var fn = own$8.call(map, ast.nodeName) ? map[ast.nodeName] : element$1;
      var children;
      var result;
      var position;

      if (fn === element$1) {
        config.schema = ast.namespaceURI === ns.svg ? svg_1 : html_1$1;
      }

      if (ast.childNodes) {
        children = nodes(ast.childNodes, config);
      }

      result = fn(ast, children, config);

      if (ast.sourceCodeLocation && config.file) {
        position = location(result, ast.sourceCodeLocation, config);

        if (position) {
          config.location = true;
          result.position = position;
        }
      }

      config.schema = schema;

      return result
    }

    // Transform children.
    function nodes(children, config) {
      var index = -1;
      var result = [];

      while (++index < children.length) {
        result[index] = transform(children[index], config);
      }

      return result
    }

    // Transform a document.
    // Stores `ast.quirksMode` in `node.data.quirksMode`.
    function root$1(ast, children, config) {
      var result = {
        type: 'root',
        children: children,
        data: {quirksMode: ast.mode === 'quirks' || ast.mode === 'limited-quirks'}
      };
      var doc;
      var location;

      if (config.file && config.location) {
        doc = String(config.file);
        location = vfileLocation(doc);
        result.position = {
          start: location.toPoint(0),
          end: location.toPoint(doc.length)
        };
      }

      return result
    }

    // Transform a doctype.
    function doctype$1(ast) {
      return {
        type: 'doctype',
        name: ast.name || '',
        public: ast.publicId || null,
        system: ast.systemId || null
      }
    }

    // Transform a text.
    function text$3(ast) {
      return {type: 'text', value: ast.value}
    }

    // Transform a comment.
    function comment(ast) {
      return {type: 'comment', value: ast.data}
    }

    // Transform an element.
    function element$1(ast, children, config) {
      var fn = config.schema.space === 'svg' ? svg_1$1 : hastscript;
      var props = {};
      var index = -1;
      var result;
      var attribute;
      var pos;
      var start;
      var end;

      while (++index < ast.attrs.length) {
        attribute = ast.attrs[index];
        props[(attribute.prefix ? attribute.prefix + ':' : '') + attribute.name] =
          attribute.value;
      }

      result = fn(ast.tagName, props, children);

      if (result.tagName === 'template' && 'content' in ast) {
        pos = ast.sourceCodeLocation;
        start = pos && pos.startTag && position$2(pos.startTag).end;
        end = pos && pos.endTag && position$2(pos.endTag).start;

        result.content = transform(ast.content, config);

        if ((start || end) && config.file) {
          result.content.position = {start: start, end: end};
        }
      }

      return result
    }

    // Create clean positional information.
    function location(node, location, config) {
      var result = position$2(location);
      var tail;
      var key;
      var props;

      if (node.type === 'element') {
        tail = node.children[node.children.length - 1];

        // Bug for unclosed with children.
        // See: <https://github.com/inikulin/parse5/issues/109>.
        if (!location.endTag && tail && tail.position && tail.position.end) {
          result.end = Object.assign({}, tail.position.end);
        }

        if (config.verbose) {
          props = {};

          for (key in location.attrs) {
            props[find_1(config.schema, key).property] = position$2(location.attrs[key]);
          }

          node.data = {
            position: {
              opening: position$2(location.startTag),
              closing: location.endTag ? position$2(location.endTag) : null,
              properties: props
            }
          };
        }
      }

      return result
    }

    function position$2(loc) {
      var start = point$1({
        line: loc.startLine,
        column: loc.startCol,
        offset: loc.startOffset
      });
      var end = point$1({
        line: loc.endLine,
        column: loc.endCol,
        offset: loc.endOffset
      });
      return start || end ? {start: start, end: end} : null
    }

    function point$1(point) {
      return point.line && point.column ? point : null
    }

    var classId = "classID";
    var dataType = "datatype";
    var itemId = "itemID";
    var strokeDashArray = "strokeDasharray";
    var strokeDashOffset = "strokeDashoffset";
    var strokeLineCap = "strokeLinecap";
    var strokeLineJoin = "strokeLinejoin";
    var strokeMiterLimit = "strokeMiterlimit";
    var typeOf = "typeof";
    var xLinkActuate = "xlinkActuate";
    var xLinkArcRole = "xlinkArcrole";
    var xLinkHref = "xlinkHref";
    var xLinkRole = "xlinkRole";
    var xLinkShow = "xlinkShow";
    var xLinkTitle = "xlinkTitle";
    var xLinkType = "xlinkType";
    var xmlnsXLink = "xmlnsXlink";
    var hastToReact = {
    	classId: classId,
    	dataType: dataType,
    	itemId: itemId,
    	strokeDashArray: strokeDashArray,
    	strokeDashOffset: strokeDashOffset,
    	strokeLineCap: strokeLineCap,
    	strokeLineJoin: strokeLineJoin,
    	strokeMiterLimit: strokeMiterLimit,
    	typeOf: typeOf,
    	xLinkActuate: xLinkActuate,
    	xLinkArcRole: xLinkArcRole,
    	xLinkHref: xLinkHref,
    	xLinkRole: xLinkRole,
    	xLinkShow: xLinkShow,
    	xLinkTitle: xLinkTitle,
    	xLinkType: xLinkType,
    	xmlnsXLink: xmlnsXLink
    };

    // http://www.w3.org/TR/CSS21/grammar.html
    // https://github.com/visionmedia/css-parse/pull/49#issuecomment-30088027
    var COMMENT_REGEX = /\/\*[^*]*\*+([^/*][^*]*\*+)*\//g;

    var NEWLINE_REGEX = /\n/g;
    var WHITESPACE_REGEX = /^\s*/;

    // declaration
    var PROPERTY_REGEX = /^(\*?[-#/*\\\w]+(\[[0-9a-z_-]+\])?)\s*/;
    var COLON_REGEX = /^:\s*/;
    var VALUE_REGEX = /^((?:'(?:\\'|.)*?'|"(?:\\"|.)*?"|\([^)]*?\)|[^};])+)/;
    var SEMICOLON_REGEX = /^[;\s]*/;

    // https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String/Trim#Polyfill
    var TRIM_REGEX = /^\s+|\s+$/g;

    // strings
    var NEWLINE = '\n';
    var FORWARD_SLASH = '/';
    var ASTERISK = '*';
    var EMPTY_STRING = '';

    // types
    var TYPE_COMMENT = 'comment';
    var TYPE_DECLARATION = 'declaration';

    /**
     * @param {String} style
     * @param {Object} [options]
     * @return {Object[]}
     * @throws {TypeError}
     * @throws {Error}
     */
    var inlineStyleParser = function(style, options) {
      if (typeof style !== 'string') {
        throw new TypeError('First argument must be a string');
      }

      if (!style) return [];

      options = options || {};

      /**
       * Positional.
       */
      var lineno = 1;
      var column = 1;

      /**
       * Update lineno and column based on `str`.
       *
       * @param {String} str
       */
      function updatePosition(str) {
        var lines = str.match(NEWLINE_REGEX);
        if (lines) lineno += lines.length;
        var i = str.lastIndexOf(NEWLINE);
        column = ~i ? str.length - i : column + str.length;
      }

      /**
       * Mark position and patch `node.position`.
       *
       * @return {Function}
       */
      function position() {
        var start = { line: lineno, column: column };
        return function(node) {
          node.position = new Position(start);
          whitespace();
          return node;
        };
      }

      /**
       * Store position information for a node.
       *
       * @constructor
       * @property {Object} start
       * @property {Object} end
       * @property {undefined|String} source
       */
      function Position(start) {
        this.start = start;
        this.end = { line: lineno, column: column };
        this.source = options.source;
      }

      /**
       * Non-enumerable source string.
       */
      Position.prototype.content = style;

      /**
       * Error `msg`.
       *
       * @param {String} msg
       * @throws {Error}
       */
      function error(msg) {
        var err = new Error(
          options.source + ':' + lineno + ':' + column + ': ' + msg
        );
        err.reason = msg;
        err.filename = options.source;
        err.line = lineno;
        err.column = column;
        err.source = style;

        if (options.silent) ; else {
          throw err;
        }
      }

      /**
       * Match `re` and return captures.
       *
       * @param {RegExp} re
       * @return {undefined|Array}
       */
      function match(re) {
        var m = re.exec(style);
        if (!m) return;
        var str = m[0];
        updatePosition(str);
        style = style.slice(str.length);
        return m;
      }

      /**
       * Parse whitespace.
       */
      function whitespace() {
        match(WHITESPACE_REGEX);
      }

      /**
       * Parse comments.
       *
       * @param {Object[]} [rules]
       * @return {Object[]}
       */
      function comments(rules) {
        var c;
        rules = rules || [];
        while ((c = comment())) {
          if (c !== false) {
            rules.push(c);
          }
        }
        return rules;
      }

      /**
       * Parse comment.
       *
       * @return {Object}
       * @throws {Error}
       */
      function comment() {
        var pos = position();
        if (FORWARD_SLASH != style.charAt(0) || ASTERISK != style.charAt(1)) return;

        var i = 2;
        while (
          EMPTY_STRING != style.charAt(i) &&
          (ASTERISK != style.charAt(i) || FORWARD_SLASH != style.charAt(i + 1))
        ) {
          ++i;
        }
        i += 2;

        if (EMPTY_STRING === style.charAt(i - 1)) {
          return error('End of comment missing');
        }

        var str = style.slice(2, i - 2);
        column += 2;
        updatePosition(str);
        style = style.slice(i);
        column += 2;

        return pos({
          type: TYPE_COMMENT,
          comment: str
        });
      }

      /**
       * Parse declaration.
       *
       * @return {Object}
       * @throws {Error}
       */
      function declaration() {
        var pos = position();

        // prop
        var prop = match(PROPERTY_REGEX);
        if (!prop) return;
        comment();

        // :
        if (!match(COLON_REGEX)) return error("property missing ':'");

        // val
        var val = match(VALUE_REGEX);

        var ret = pos({
          type: TYPE_DECLARATION,
          property: trim(prop[0].replace(COMMENT_REGEX, EMPTY_STRING)),
          value: val
            ? trim(val[0].replace(COMMENT_REGEX, EMPTY_STRING))
            : EMPTY_STRING
        });

        // ;
        match(SEMICOLON_REGEX);

        return ret;
      }

      /**
       * Parse declarations.
       *
       * @return {Object[]}
       */
      function declarations() {
        var decls = [];

        comments(decls);

        // declarations
        var decl;
        while ((decl = declaration())) {
          if (decl !== false) {
            decls.push(decl);
            comments(decls);
          }
        }

        return decls;
      }

      whitespace();
      return declarations();
    };

    /**
     * Trim `str`.
     *
     * @param {String} str
     * @return {String}
     */
    function trim(str) {
      return str ? str.replace(TRIM_REGEX, EMPTY_STRING) : EMPTY_STRING;
    }

    /**
     * Parses inline style to object.
     *
     * @example
     * // returns { 'line-height': '42' }
     * StyleToObject('line-height: 42;');
     *
     * @param  {String}      style      - The inline style.
     * @param  {Function}    [iterator] - The iterator function.
     * @return {null|Object}
     */
    function StyleToObject(style, iterator) {
      var output = null;
      if (!style || typeof style !== 'string') {
        return output;
      }

      var declaration;
      var declarations = inlineStyleParser(style);
      var hasIterator = typeof iterator === 'function';
      var property;
      var value;

      for (var i = 0, len = declarations.length; i < len; i++) {
        declaration = declarations[i];
        property = declaration.property;
        value = declaration.value;

        if (hasIterator) {
          iterator(property, value, declaration);
        } else if (value) {
          output || (output = {});
          output[property] = value;
        }
      }

      return output;
    }

    var styleToObject = StyleToObject;

    var root$2 = convert_1('root');
    var element$2 = convert_1('element');
    var text$4 = convert_1('text');

    var hastToHyperscript = wrapper$1;

    function wrapper$1(h, node, options) {
      var settings = options || {};
      var r = react(h);
      var v = vue(h);
      var vd = vdom(h);
      var prefix;

      if (typeof h !== 'function') {
        throw new Error('h is not a function')
      }

      if (typeof settings === 'string' || typeof settings === 'boolean') {
        prefix = settings;
        settings = {};
      } else {
        prefix = settings.prefix;
      }

      if (root$2(node)) {
        node =
          node.children.length === 1 && element$2(node.children[0])
            ? node.children[0]
            : {
                type: 'element',
                tagName: 'div',
                properties: {},
                children: node.children
              };
      } else if (!element$2(node)) {
        throw new Error(
          'Expected root or element, not `' + ((node && node.type) || node) + '`'
        )
      }

      return toH(h, node, {
        schema: settings.space === 'svg' ? svg_1 : html_1$1,
        prefix: prefix == null ? (r || v || vd ? 'h-' : null) : prefix,
        key: 0,
        react: r,
        vue: v,
        vdom: vd,
        hyperscript: hyperscript(h)
      })
    }

    // Transform a hast node through a hyperscript interface to *anything*!
    function toH(h, node, ctx) {
      var parentSchema = ctx.schema;
      var schema = parentSchema;
      var name = node.tagName;
      var attributes = {};
      var nodes = [];
      var index = -1;
      var key;
      var value;

      if (parentSchema.space === 'html' && name.toLowerCase() === 'svg') {
        schema = svg_1;
        ctx.schema = schema;
      }

      for (key in node.properties) {
        addAttribute(attributes, key, node.properties[key], ctx, name);
      }

      if (ctx.vdom) {
        if (schema.space === 'html') {
          name = name.toUpperCase();
        } else {
          attributes.namespace = ns[schema.space];
        }
      }

      if (ctx.prefix) {
        ctx.key++;
        attributes.key = ctx.prefix + ctx.key;
      }

      if (node.children) {
        while (++index < node.children.length) {
          value = node.children[index];

          if (element$2(value)) {
            nodes.push(toH(h, value, ctx));
          } else if (text$4(value)) {
            nodes.push(value.value);
          }
        }
      }

      // Restore parent schema.
      ctx.schema = parentSchema;

      // Ensure no React warnings are triggered for void elements having children
      // passed in.
      return nodes.length
        ? h.call(node, name, attributes, nodes)
        : h.call(node, name, attributes)
    }

    function addAttribute(props, prop, value, ctx, name) {
      var info = find_1(ctx.schema, prop);
      var subprop;

      // Ignore nullish and `NaN` values.
      // Ignore `false` and falsey known booleans for hyperlike DSLs.
      if (
        value == null ||
        value !== value ||
        (value === false && (ctx.vue || ctx.vdom || ctx.hyperscript)) ||
        (!value && info.boolean && (ctx.vue || ctx.vdom || ctx.hyperscript))
      ) {
        return
      }

      if (value && typeof value === 'object' && 'length' in value) {
        // Accept `array`.
        // Most props are space-separated.
        value = (info.commaSeparated ? commaSeparatedTokens : spaceSeparatedTokens).stringify(value);
      }

      // Treat `true` and truthy known booleans.
      if (info.boolean && ctx.hyperscript) {
        value = '';
      }

      // VDOM, Vue, and React accept `style` as object.
      if (
        info.property === 'style' &&
        typeof value === 'string' &&
        (ctx.react || ctx.vue || ctx.vdom)
      ) {
        value = parseStyle(value, name);
      }

      if (ctx.vue) {
        if (info.property !== 'style') subprop = 'attrs';
      } else if (!info.mustUseProperty) {
        if (ctx.vdom) {
          if (info.property !== 'style') subprop = 'attributes';
        } else if (ctx.hyperscript) {
          subprop = 'attrs';
        }
      }

      if (subprop) {
        if (!props[subprop]) props[subprop] = {};
        props[subprop][info.attribute] = value;
      } else if (info.space && ctx.react) {
        props[hastToReact[info.property] || info.property] = value;
      } else {
        props[info.attribute] = value;
      }
    }

    // Check if `h` is `react.createElement`.
    function react(h) {
      var node = h && h('div');
      return Boolean(
        node && ('_owner' in node || '_store' in node) && node.key == null
      )
    }

    // Check if `h` is `hyperscript`.
    function hyperscript(h) {
      return Boolean(h && h.context && h.cleanup)
    }

    // Check if `h` is `virtual-dom/h`.
    function vdom(h) {
      return h && h('div').type === 'VirtualNode'
    }

    function vue(h) {
      var node = h && h('div');
      return Boolean(node && node.context && node.context._isVue)
    }

    function parseStyle(value, tagName) {
      var result = {};

      try {
        styleToObject(value, iterator);
      } catch (error) {
        error.message =
          tagName + '[style]' + error.message.slice('undefined'.length);
        throw error
      }

      return result

      function iterator(name, value) {
        if (name.slice(0, 4) === '-ms-') name = 'ms-' + name.slice(4);
        result[name.replace(/-([a-z])/g, styleReplacer)] = value;
      }
    }

    function styleReplacer($0, $1) {
      return $1.toUpperCase()
    }

    var zwitch = factory$4;

    var noop$1 = Function.prototype;
    var own$9 = {}.hasOwnProperty;

    // Handle values based on a property.
    function factory$4(key, options) {
      var settings = options || {};

      function one(value) {
        var fn = one.invalid;
        var handlers = one.handlers;

        if (value && own$9.call(value, key)) {
          fn = own$9.call(handlers, value[key]) ? handlers[value[key]] : one.unknown;
        }

        return (fn || noop$1).apply(this, arguments)
      }

      one.handlers = settings.handlers || {};
      one.invalid = settings.invalid;
      one.unknown = settings.unknown;

      return one
    }

    var hastUtilToParse5 = transform$1;

    var ignoredSpaces = ['svg', 'html'];

    var one$1 = zwitch('type');

    one$1.handlers.root = root$3;
    one$1.handlers.element = element$3;
    one$1.handlers.text = text$5;
    one$1.handlers.comment = comment$1;
    one$1.handlers.doctype = doctype$2;

    // Transform a tree from hast to Parse5’s AST.
    function transform$1(tree, space) {
      return one$1(tree, space === 'svg' ? svg_1 : html_1$1)
    }

    function root$3(node, schema) {
      var data = node.data || {};
      var mode = data.quirksMode ? 'quirks' : 'no-quirks';

      return patch(node, {nodeName: '#document', mode: mode}, schema)
    }

    function fragment(node, schema) {
      return patch(node, {nodeName: '#document-fragment'}, schema)
    }

    function doctype$2(node, schema) {
      return patch(
        node,
        {
          nodeName: '#documentType',
          name: node.name,
          publicId: node.public || '',
          systemId: node.system || ''
        },
        schema
      )
    }

    function text$5(node, schema) {
      return patch(node, {nodeName: '#text', value: node.value}, schema)
    }

    function comment$1(node, schema) {
      return patch(node, {nodeName: '#comment', data: node.value}, schema)
    }

    function element$3(node, schema) {
      var space = schema.space;
      var shallow = immutable(node, {children: []});

      return hastToHyperscript(h, shallow, {space: space})

      function h(name, attrs) {
        var values = [];
        var p5;
        var attr;
        var value;
        var key;
        var info;
        var pos;

        for (key in attrs) {
          info = find_1(schema, key);
          attr = attrs[key];

          if (attr === false || (info.boolean && !attr)) {
            continue
          }

          value = {name: key, value: attr === true ? '' : String(attr)};

          if (info.space && ignoredSpaces.indexOf(info.space) === -1) {
            pos = key.indexOf(':');

            if (pos === -1) {
              value.prefix = '';
            } else {
              value.name = key.slice(pos + 1);
              value.prefix = key.slice(0, pos);
            }

            value.namespace = ns[info.space];
          }

          values.push(value);
        }

        p5 = patch(node, {nodeName: name, tagName: name, attrs: values}, schema);

        if (name === 'template') {
          p5.content = fragment(shallow.content, schema);
        }

        return p5
      }
    }

    // Patch specific properties.
    function patch(node, p5, parentSchema) {
      var schema = parentSchema;
      var position = node.position;
      var children = node.children;
      var childNodes = [];
      var length = children ? children.length : 0;
      var index = -1;
      var child;

      if (node.type === 'element') {
        if (schema.space === 'html' && node.tagName === 'svg') {
          schema = svg_1;
        }

        p5.namespaceURI = ns[schema.space];
      }

      while (++index < length) {
        child = one$1(children[index], schema);
        child.parentNode = p5;
        childNodes[index] = child;
      }

      if (node.type === 'element' || node.type === 'root') {
        p5.childNodes = childNodes;
      }

      if (position && position.start && position.end) {
        p5.sourceCodeLocation = {
          startLine: position.start.line,
          startCol: position.start.column,
          startOffset: position.start.offset,
          endLine: position.end.line,
          endCol: position.end.column,
          endOffset: position.end.offset
        };
      }

      return p5
    }

    var voids = [
    	"area",
    	"base",
    	"basefont",
    	"bgsound",
    	"br",
    	"col",
    	"command",
    	"embed",
    	"frame",
    	"hr",
    	"image",
    	"img",
    	"input",
    	"isindex",
    	"keygen",
    	"link",
    	"menuitem",
    	"meta",
    	"nextid",
    	"param",
    	"source",
    	"track",
    	"wbr"
    ];

    var hastUtilRaw = wrap$2;

    var inTemplateMode = 'IN_TEMPLATE_MODE';
    var dataState = 'DATA_STATE';
    var characterToken = 'CHARACTER_TOKEN';
    var startTagToken = 'START_TAG_TOKEN';
    var endTagToken = 'END_TAG_TOKEN';
    var commentToken = 'COMMENT_TOKEN';
    var doctypeToken = 'DOCTYPE_TOKEN';

    var parseOptions = {
      sourceCodeLocationInfo: true,
      scriptingEnabled: false
    };

    function wrap$2(tree, file) {
      var parser$1 = new parser(parseOptions);
      var one = zwitch('type');
      var tokenizer;
      var preprocessor;
      var posTracker;
      var locationTracker;
      var result;

      one.handlers.root = root;
      one.handlers.element = element;
      one.handlers.text = text;
      one.handlers.comment = comment;
      one.handlers.doctype = doctype;
      one.handlers.raw = raw;
      one.unknown = unknown$1;

      result = hastUtilFromParse5(documentMode(tree) ? document() : fragment(), file);

      // Unpack if possible and when not given a `root`.
      if (tree.type !== 'root' && result.children.length === 1) {
        return result.children[0]
      }

      return result

      function fragment() {
        var context;
        var mock;
        var doc;

        context = {
          nodeName: 'template',
          tagName: 'template',
          attrs: [],
          namespaceURI: ns.html,
          childNodes: []
        };

        mock = {
          nodeName: 'documentmock',
          tagName: 'documentmock',
          attrs: [],
          namespaceURI: ns.html,
          childNodes: []
        };

        doc = {
          nodeName: '#document-fragment',
          childNodes: []
        };

        parser$1._bootstrap(mock, context);
        parser$1._pushTmplInsertionMode(inTemplateMode);
        parser$1._initTokenizerForFragmentParsing();
        parser$1._insertFakeRootElement();
        parser$1._resetInsertionMode();
        parser$1._findFormInFragmentContext();

        tokenizer = parser$1.tokenizer;
        preprocessor = tokenizer.preprocessor;
        locationTracker = tokenizer.__mixins[0];
        posTracker = locationTracker.posTracker;

        one(tree);

        parser$1._adoptNodes(mock.childNodes[0], doc);

        return doc
      }

      function document() {
        var doc = parser$1.treeAdapter.createDocument();

        parser$1._bootstrap(doc, null);
        tokenizer = parser$1.tokenizer;
        preprocessor = tokenizer.preprocessor;
        locationTracker = tokenizer.__mixins[0];
        posTracker = locationTracker.posTracker;

        one(tree);

        return doc
      }

      function all(nodes) {
        var length = 0;
        var index = -1;

        /* istanbul ignore else - invalid nodes, see rehypejs/rehype-raw#7. */
        if (nodes) {
          length = nodes.length;
        }

        while (++index < length) {
          one(nodes[index]);
        }
      }

      function root(node) {
        all(node.children);
      }

      function element(node) {
        var empty = voids.indexOf(node.tagName) !== -1;

        resetTokenizer();
        parser$1._processToken(startTag(node), ns.html);

        all(node.children);

        if (!empty) {
          resetTokenizer();
          parser$1._processToken(endTag(node));
        }
      }

      function text(node) {
        resetTokenizer();
        parser$1._processToken({
          type: characterToken,
          chars: node.value,
          location: createParse5Location(node)
        });
      }

      function doctype(node) {
        var p5 = hastUtilToParse5(node);
        resetTokenizer();
        parser$1._processToken({
          type: doctypeToken,
          name: p5.name,
          forceQuirks: false,
          publicId: p5.publicId,
          systemId: p5.systemId,
          location: createParse5Location(node)
        });
      }

      function comment(node) {
        resetTokenizer();
        parser$1._processToken({
          type: commentToken,
          data: node.value,
          location: createParse5Location(node)
        });
      }

      function raw(node) {
        var start = unistUtilPosition.start(node);
        var line = start.line || 1;
        var column = start.column || 1;
        var offset = start.offset || 0;
        var token;

        // Reset preprocessor:
        // See: <https://github.com/inikulin/parse5/blob/9c683e1/packages/parse5/lib/tokenizer/preprocessor.js>.
        preprocessor.html = null;
        preprocessor.pos = -1;
        preprocessor.lastGapPos = -1;
        preprocessor.lastCharPos = -1;
        preprocessor.gapStack = [];
        preprocessor.skipNextNewLine = false;
        preprocessor.lastChunkWritten = false;
        preprocessor.endOfChunkHit = false;

        // Reset preprocessor mixin:
        // See: <https://github.com/inikulin/parse5/blob/9c683e1/packages/parse5/lib/extensions/position-tracking/preprocessor-mixin.js>.
        posTracker.isEol = false;
        posTracker.lineStartPos = -column + 1; // Looks weird, but ensures we get correct positional info.
        posTracker.droppedBufferSize = offset;
        posTracker.offset = 0;
        posTracker.col = 1;
        posTracker.line = line;

        // Reset location tracker:
        // See: <https://github.com/inikulin/parse5/blob/9c683e1/packages/parse5/lib/extensions/location-info/tokenizer-mixin.js>.
        locationTracker.currentAttrLocation = null;
        locationTracker.ctLoc = createParse5Location(node);

        // See the code for `parse` and `parseFragment`:
        // See: <https://github.com/inikulin/parse5/blob/9c683e1/packages/parse5/lib/parser/index.js#L371>.
        tokenizer.write(node.value);
        parser$1._runParsingLoop(null);

        // Process final characters if they’re still there after hibernating.
        // Similar to:
        // See: <https://github.com/inikulin/parse5/blob/9c683e1/packages/parse5/lib/extensions/location-info/tokenizer-mixin.js#L95>.
        token = tokenizer.currentCharacterToken;

        if (token) {
          token.location.endLine = posTracker.line;
          token.location.endCol = posTracker.col + 1;
          token.location.endOffset = posTracker.offset + 1;
          parser$1._processToken(token);
        }
      }

      function resetTokenizer() {
        // Reset tokenizer:
        // See: <https://github.com/inikulin/parse5/blob/9c683e1/packages/parse5/lib/tokenizer/index.js#L218-L234>.
        // Especially putting it back in the `data` state is useful: some elements,
        // like textareas and iframes, change the state.
        // See GH-7.
        // But also if broken HTML is in `raw`, and then a correct element is given.
        // See GH-11.
        tokenizer.tokenQueue = [];
        tokenizer.state = dataState;
        tokenizer.returnState = '';
        tokenizer.charRefCode = -1;
        tokenizer.tempBuff = [];
        tokenizer.lastStartTagName = '';
        tokenizer.consumedAfterSnapshot = -1;
        tokenizer.active = false;
        tokenizer.currentCharacterToken = null;
        tokenizer.currentToken = null;
        tokenizer.currentAttr = null;
      }
    }

    function startTag(node) {
      var location = createParse5Location(node);

      location.startTag = immutable(location);

      return {
        type: startTagToken,
        tagName: node.tagName,
        selfClosing: false,
        attrs: attributes(node),
        location: location
      }
    }

    function attributes(node) {
      return hastUtilToParse5({
        tagName: node.tagName,
        type: 'element',
        properties: node.properties
      }).attrs
    }

    function endTag(node) {
      var location = createParse5Location(node);

      location.endTag = immutable(location);

      return {
        type: endTagToken,
        tagName: node.tagName,
        attrs: [],
        location: location
      }
    }

    function unknown$1(node) {
      throw new Error('Cannot compile `' + node.type + '` node')
    }

    function documentMode(node) {
      var head = node.type === 'root' ? node.children[0] : node;

      return head && (head.type === 'doctype' || head.tagName === 'html')
    }

    function createParse5Location(node) {
      var start = unistUtilPosition.start(node);
      var end = unistUtilPosition.end(node);

      return {
        startLine: start.line,
        startCol: start.column,
        startOffset: start.offset,
        endLine: end.line,
        endCol: end.column,
        endOffset: end.offset
      }
    }

    var rehypeRaw = raw;

    function raw() {
      return hastUtilRaw
    }

    var strip = [
    	"script"
    ];
    var clobberPrefix = "user-content-";
    var clobber = [
    	"name",
    	"id"
    ];
    var ancestors = {
    	tbody: [
    		"table"
    	],
    	tfoot: [
    		"table"
    	],
    	thead: [
    		"table"
    	],
    	td: [
    		"table"
    	],
    	th: [
    		"table"
    	],
    	tr: [
    		"table"
    	]
    };
    var protocols = {
    	href: [
    		"http",
    		"https",
    		"mailto",
    		"xmpp",
    		"irc",
    		"ircs"
    	],
    	cite: [
    		"http",
    		"https"
    	],
    	src: [
    		"http",
    		"https"
    	],
    	longDesc: [
    		"http",
    		"https"
    	]
    };
    var tagNames = [
    	"h1",
    	"h2",
    	"h3",
    	"h4",
    	"h5",
    	"h6",
    	"br",
    	"b",
    	"i",
    	"strong",
    	"em",
    	"a",
    	"pre",
    	"code",
    	"img",
    	"tt",
    	"div",
    	"ins",
    	"del",
    	"sup",
    	"sub",
    	"p",
    	"ol",
    	"ul",
    	"table",
    	"thead",
    	"tbody",
    	"tfoot",
    	"blockquote",
    	"dl",
    	"dt",
    	"dd",
    	"kbd",
    	"q",
    	"samp",
    	"var",
    	"hr",
    	"ruby",
    	"rt",
    	"rp",
    	"li",
    	"tr",
    	"td",
    	"th",
    	"s",
    	"strike",
    	"summary",
    	"details",
    	"caption",
    	"figure",
    	"figcaption",
    	"abbr",
    	"bdo",
    	"cite",
    	"dfn",
    	"mark",
    	"small",
    	"span",
    	"time",
    	"wbr",
    	"input"
    ];
    var attributes$1 = {
    	a: [
    		"href"
    	],
    	img: [
    		"src",
    		"longDesc"
    	],
    	input: [
    		[
    			"type",
    			"checkbox"
    		],
    		[
    			"disabled",
    			true
    		]
    	],
    	li: [
    		[
    			"className",
    			"task-list-item"
    		]
    	],
    	div: [
    		"itemScope",
    		"itemType"
    	],
    	blockquote: [
    		"cite"
    	],
    	del: [
    		"cite"
    	],
    	ins: [
    		"cite"
    	],
    	q: [
    		"cite"
    	],
    	"*": [
    		"abbr",
    		"accept",
    		"acceptCharset",
    		"accessKey",
    		"action",
    		"align",
    		"alt",
    		"ariaDescribedBy",
    		"ariaHidden",
    		"ariaLabel",
    		"ariaLabelledBy",
    		"axis",
    		"border",
    		"cellPadding",
    		"cellSpacing",
    		"char",
    		"charOff",
    		"charSet",
    		"checked",
    		"clear",
    		"cols",
    		"colSpan",
    		"color",
    		"compact",
    		"coords",
    		"dateTime",
    		"dir",
    		"disabled",
    		"encType",
    		"htmlFor",
    		"frame",
    		"headers",
    		"height",
    		"hrefLang",
    		"hSpace",
    		"isMap",
    		"id",
    		"label",
    		"lang",
    		"maxLength",
    		"media",
    		"method",
    		"multiple",
    		"name",
    		"noHref",
    		"noShade",
    		"noWrap",
    		"open",
    		"prompt",
    		"readOnly",
    		"rel",
    		"rev",
    		"rows",
    		"rowSpan",
    		"rules",
    		"scope",
    		"selected",
    		"shape",
    		"size",
    		"span",
    		"start",
    		"summary",
    		"tabIndex",
    		"target",
    		"title",
    		"type",
    		"useMap",
    		"vAlign",
    		"value",
    		"vSpace",
    		"width",
    		"itemProp"
    	]
    };
    var required = {
    	input: {
    		type: "checkbox",
    		disabled: true
    	}
    };
    var ghSchema = {
    	strip: strip,
    	clobberPrefix: clobberPrefix,
    	clobber: clobber,
    	ancestors: ancestors,
    	protocols: protocols,
    	tagNames: tagNames,
    	attributes: attributes$1,
    	required: required
    };

    var lib$2 = wrapper$2;

    var own$a = {}.hasOwnProperty;
    var push = [].push;

    var nodeSchema = {
      root: {children: all$2},
      doctype: handleDoctype,
      comment: handleComment,
      element: {
        tagName: handleTagName,
        properties: handleProperties,
        children: all$2
      },
      text: {value: handleValue},
      '*': {data: allow, position: allow}
    };

    // Sanitize `node`, according to `schema`.
    function wrapper$2(node, schema) {
      var ctx = {type: 'root', children: []};
      var replace;

      if (node && typeof node === 'object' && node.type) {
        replace = one$2(immutable(ghSchema, schema || {}), node, []);

        if (replace) {
          if ('length' in replace) {
            if (replace.length === 1) {
              ctx = replace[0];
            } else {
              ctx.children = replace;
            }
          } else {
            ctx = replace;
          }
        }
      }

      return ctx
    }

    // Sanitize `node`.
    function one$2(schema, node, stack) {
      var type = node && node.type;
      var replacement = {type: node.type};
      var replace;
      var definition;
      var allowed;
      var result;
      var key;

      if (own$a.call(nodeSchema, type)) {
        definition = nodeSchema[type];

        if (typeof definition === 'function') {
          definition = definition(schema, node);
        }

        if (definition) {
          replace = true;
          allowed = immutable(definition, nodeSchema['*']);

          for (key in allowed) {
            result = allowed[key](schema, node[key], node, stack);

            if (result === false) {
              replace = null;
              // Set the non-safe value.
              replacement[key] = node[key];
            } else if (result != null) {
              replacement[key] = result;
            }
          }
        }
      }

      if (replace) {
        return replacement
      }

      return replacement.children &&
        replacement.children.length &&
        schema.strip.indexOf(replacement.tagName) < 0
        ? replacement.children
        : null
    }

    // Sanitize `children`.
    function all$2(schema, children, node, stack) {
      var results = [];
      var index = -1;
      var value;

      if (children) {
        stack.push(node.tagName);

        while (++index < children.length) {
          value = one$2(schema, children[index], stack);

          if (value) {
            if ('length' in value) {
              push.apply(results, value);
            } else {
              results.push(value);
            }
          }
        }

        stack.pop();
      }

      return results
    }

    // Sanitize `properties`.
    function handleProperties(schema, properties, node, stack) {
      var name = handleTagName(schema, node.tagName, node, stack);
      var reqs = schema.required || /* istanbul ignore next */ {};
      var props = properties || {};
      var allowed = immutable(
        toPropertyValueMap(schema.attributes['*']),
        toPropertyValueMap(
          own$a.call(schema.attributes, name) ? schema.attributes[name] : []
        )
      );
      var result = {};
      var definition;
      var key;
      var value;

      for (key in props) {
        if (own$a.call(allowed, key)) {
          definition = allowed[key];
        } else if (data$1(key) && own$a.call(allowed, 'data*')) {
          definition = allowed['data*'];
        } else {
          continue
        }

        value = props[key];
        value =
          value && typeof value === 'object' && 'length' in value
            ? handlePropertyValues(schema, value, key, definition)
            : handlePropertyValue(schema, value, key, definition);

        if (value != null) {
          result[key] = value;
        }
      }

      if (own$a.call(reqs, name)) {
        for (key in reqs[name]) {
          if (!own$a.call(result, key)) {
            result[key] = reqs[name][key];
          }
        }
      }

      return result
    }

    // Sanitize a property value which is a list.
    function handlePropertyValues(schema, values, prop, definition) {
      var result = [];
      var index = -1;
      var value;

      while (++index < values.length) {
        value = handlePropertyValue(schema, values[index], prop, definition);

        if (value != null) {
          result.push(value);
        }
      }

      return result
    }

    // Sanitize a property value.
    function handlePropertyValue(schema, value, prop, definition) {
      if (
        (typeof value === 'boolean' ||
          typeof value === 'number' ||
          typeof value === 'string') &&
        handleProtocol(schema, value, prop) &&
        (!definition.length || definition.indexOf(value) > -1)
      ) {
        return schema.clobber.indexOf(prop) < 0
          ? value
          : schema.clobberPrefix + value
      }
    }

    // Check whether `value` is a safe URL.
    function handleProtocol(schema, value, prop) {
      var url = String(value);
      var colon = url.indexOf(':');
      var questionMark = url.indexOf('?');
      var numberSign = url.indexOf('#');
      var slash = url.indexOf('/');
      var protocols = own$a.call(schema.protocols, prop)
        ? schema.protocols[prop].concat()
        : [];
      var index = -1;

      if (
        !protocols.length ||
        colon < 0 ||
        // If the first colon is after a `?`, `#`, or `/`, it’s not a protocol.
        (slash > -1 && colon > slash) ||
        (questionMark > -1 && colon > questionMark) ||
        (numberSign > -1 && colon > numberSign)
      ) {
        return true
      }

      while (++index < protocols.length) {
        if (
          colon === protocols[index].length &&
          url.slice(0, protocols[index].length) === protocols[index]
        ) {
          return true
        }
      }

      return false
    }

    // Always return a valid HTML5 doctype.
    function handleDoctypeName() {
      return 'html'
    }

    // Sanitize `tagName`.
    function handleTagName(schema, tagName, node, stack) {
      var name = typeof tagName === 'string' && tagName;
      var index = -1;

      if (!name || name === '*' || schema.tagNames.indexOf(name) < 0) {
        return false
      }

      // Some nodes can break out of their context if they don’t have a certain
      // ancestor.
      if (own$a.call(schema.ancestors, name)) {
        while (++index < schema.ancestors[name].length) {
          if (stack.indexOf(schema.ancestors[name][index]) > -1) {
            return name
          }
        }

        return false
      }

      return name
    }

    function handleDoctype(schema) {
      return schema.allowDoctypes ? {name: handleDoctypeName} : null
    }

    function handleComment(schema) {
      return schema.allowComments ? {value: handleCommentValue} : null
    }

    // See <https://html.spec.whatwg.org/multipage/parsing.html#serialising-html-fragments>
    function handleCommentValue(schema, value) {
      var result = typeof value === 'string' ? value : '';
      var index = result.indexOf('-->');

      return index < 0 ? result : result.slice(0, index)
    }

    // Sanitize `value`.
    function handleValue(schema, value) {
      return typeof value === 'string' ? value : ''
    }

    // Create a map from a list of props or a list of properties and values.
    function toPropertyValueMap(values) {
      var result = {};
      var index = -1;
      var value;

      while (++index < values.length) {
        value = values[index];

        if (value && typeof value === 'object' && 'length' in value) {
          result[value[0]] = value.slice(1);
        } else {
          result[value] = [];
        }
      }

      return result
    }

    // Allow `value`.
    function allow(schema, value) {
      return value
    }

    // Check if `prop` is a data property.
    function data$1(prop) {
      return prop.length > 4 && prop.slice(0, 4).toLowerCase() === 'data'
    }

    var hastUtilSanitize = lib$2;

    var rehypeSanitize = sanitize;

    function sanitize(options) {
      return transformer
      function transformer(tree) {
        return hastUtilSanitize(tree, options)
      }
    }

    var convert_1$1 = convert$1;

    function convert$1(test) {
      if (typeof test === 'string') {
        return tagNameFactory(test)
      }

      if (test === null || test === undefined) {
        return element$4
      }

      if (typeof test === 'object') {
        return any(test)
      }

      if (typeof test === 'function') {
        return callFactory(test)
      }

      throw new Error('Expected function, string, or array as test')
    }

    function convertAll(tests) {
      var length = tests.length;
      var index = -1;
      var results = [];

      while (++index < length) {
        results[index] = convert$1(tests[index]);
      }

      return results
    }

    function any(tests) {
      var checks = convertAll(tests);
      var length = checks.length;

      return matches

      function matches() {
        var index = -1;

        while (++index < length) {
          if (checks[index].apply(this, arguments)) {
            return true
          }
        }

        return false
      }
    }

    // Utility to convert a string a tag name check.
    function tagNameFactory(test) {
      return tagName

      function tagName(node) {
        return element$4(node) && node.tagName === test
      }
    }

    // Utility to convert a function check.
    function callFactory(test) {
      return call

      function call(node) {
        return element$4(node) && Boolean(test.apply(this, arguments))
      }
    }

    // Utility to return true if this is an element.
    function element$4(node) {
      return (
        node &&
        typeof node === 'object' &&
        node.type === 'element' &&
        typeof node.tagName === 'string'
      )
    }

    var hastUtilIsElement = isElement;

    isElement.convert = convert_1$1;

    // Check if if `node` is an `element` and whether it passes the given test.
    function isElement(node, test, index, parent, context) {
      var hasParent = parent !== null && parent !== undefined;
      var hasIndex = index !== null && index !== undefined;
      var check = convert_1$1(test);

      if (
        hasIndex &&
        (typeof index !== 'number' || index < 0 || index === Infinity)
      ) {
        throw new Error('Expected positive finite index for child node')
      }

      if (hasParent && (!parent.type || !parent.children)) {
        throw new Error('Expected parent node')
      }

      if (!node || !node.type || typeof node.type !== 'string') {
        return false
      }

      if (hasParent !== hasIndex) {
        throw new Error('Expected both parent and index')
      }

      return check.call(context, node, index, parent)
    }

    var hastUtilWhitespace = interElementWhiteSpace;

    // HTML white-space expression.
    // See <https://html.spec.whatwg.org/#space-character>.
    var re = /[ \t\n\f\r]/g;

    function interElementWhiteSpace(node) {
      var value;

      if (node && typeof node === 'object' && node.type === 'text') {
        value = node.value || '';
      } else if (typeof node === 'string') {
        value = node;
      } else {
        return false
      }

      return value.replace(re, '') === ''
    }

    var before = siblings(-1);
    var after = siblings(1);

    // Factory to check siblings in a direction.
    function siblings(increment) {
      return sibling

      // Find applicable siblings in a direction.
      function sibling(parent, index, includeWhiteSpace) {
        var siblings = parent && parent.children;
        var offset = index + increment;
        var next = siblings && siblings[offset];

        if (!includeWhiteSpace) {
          while (next && hastUtilWhitespace(next)) {
            offset += increment;
            next = siblings[offset];
          }
        }

        return next
      }
    }

    var siblings_1 = {
    	before: before,
    	after: after
    };

    var whiteSpaceStart_1 = whiteSpaceStart;

    var isText = convert_1('text');

    // Check if `node` starts with white-space.
    function whiteSpaceStart(node) {
      return isText(node) && hastUtilWhitespace(node.value.charAt(0))
    }

    var comment$2 = convert_1('comment');

    var omission_1 = omission;

    var own$b = {}.hasOwnProperty;

    // Factory to check if a given node can have a tag omitted.
    function omission(handlers) {
      return omit

      // Check if a given node can have a tag omitted.
      function omit(node, index, parent) {
        return (
          own$b.call(handlers, node.tagName) &&
          handlers[node.tagName](node, index, parent)
        )
      }
    }

    var closing = omission_1({
      html: html$5,
      head: headOrColgroupOrCaption,
      body: body,
      p: p,
      li: li,
      dt: dt,
      dd: dd,
      rt: rubyElement,
      rp: rubyElement,
      optgroup: optgroup,
      option: option,
      menuitem: menuitem,
      colgroup: headOrColgroupOrCaption,
      caption: headOrColgroupOrCaption,
      thead: thead,
      tbody: tbody,
      tfoot: tfoot,
      tr: tr,
      td: cells,
      th: cells
    });

    // Macro for `</head>`, `</colgroup>`, and `</caption>`.
    function headOrColgroupOrCaption(node, index, parent) {
      var next = siblings_1.after(parent, index, true);
      return !next || (!comment$2(next) && !whiteSpaceStart_1(next))
    }

    // Whether to omit `</html>`.
    function html$5(node, index, parent) {
      var next = siblings_1.after(parent, index);
      return !next || !comment$2(next)
    }

    // Whether to omit `</body>`.
    function body(node, index, parent) {
      var next = siblings_1.after(parent, index);
      return !next || !comment$2(next)
    }

    // Whether to omit `</p>`.
    function p(node, index, parent) {
      var next = siblings_1.after(parent, index);
      return next
        ? hastUtilIsElement(next, [
            'address',
            'article',
            'aside',
            'blockquote',
            'details',
            'div',
            'dl',
            'fieldset',
            'figcaption',
            'figure',
            'footer',
            'form',
            'h1',
            'h2',
            'h3',
            'h4',
            'h5',
            'h6',
            'header',
            'hgroup',
            'hr',
            'main',
            'menu',
            'nav',
            'ol',
            'p',
            'pre',
            'section',
            'table',
            'ul'
          ])
        : !parent ||
            // Confusing parent.
            !hastUtilIsElement(parent, [
              'a',
              'audio',
              'del',
              'ins',
              'map',
              'noscript',
              'video'
            ])
    }

    // Whether to omit `</li>`.
    function li(node, index, parent) {
      var next = siblings_1.after(parent, index);
      return !next || hastUtilIsElement(next, 'li')
    }

    // Whether to omit `</dt>`.
    function dt(node, index, parent) {
      var next = siblings_1.after(parent, index);
      return next && hastUtilIsElement(next, ['dt', 'dd'])
    }

    // Whether to omit `</dd>`.
    function dd(node, index, parent) {
      var next = siblings_1.after(parent, index);
      return !next || hastUtilIsElement(next, ['dt', 'dd'])
    }

    // Whether to omit `</rt>` or `</rp>`.
    function rubyElement(node, index, parent) {
      var next = siblings_1.after(parent, index);
      return !next || hastUtilIsElement(next, ['rp', 'rt'])
    }

    // Whether to omit `</optgroup>`.
    function optgroup(node, index, parent) {
      var next = siblings_1.after(parent, index);
      return !next || hastUtilIsElement(next, 'optgroup')
    }

    // Whether to omit `</option>`.
    function option(node, index, parent) {
      var next = siblings_1.after(parent, index);
      return !next || hastUtilIsElement(next, ['option', 'optgroup'])
    }

    // Whether to omit `</menuitem>`.
    function menuitem(node, index, parent) {
      var next = siblings_1.after(parent, index);
      return !next || hastUtilIsElement(next, ['menuitem', 'hr', 'menu'])
    }

    // Whether to omit `</thead>`.
    function thead(node, index, parent) {
      var next = siblings_1.after(parent, index);
      return next && hastUtilIsElement(next, ['tbody', 'tfoot'])
    }

    // Whether to omit `</tbody>`.
    function tbody(node, index, parent) {
      var next = siblings_1.after(parent, index);
      return !next || hastUtilIsElement(next, ['tbody', 'tfoot'])
    }

    // Whether to omit `</tfoot>`.
    function tfoot(node, index, parent) {
      return !siblings_1.after(parent, index)
    }

    // Whether to omit `</tr>`.
    function tr(node, index, parent) {
      var next = siblings_1.after(parent, index);
      return !next || hastUtilIsElement(next, 'tr')
    }

    // Whether to omit `</td>` or `</th>`.
    function cells(node, index, parent) {
      var next = siblings_1.after(parent, index);
      return !next || hastUtilIsElement(next, ['td', 'th'])
    }

    var opening = omission_1({
      html: html$6,
      head: head,
      body: body$1,
      colgroup: colgroup,
      tbody: tbody$1
    });

    // Whether to omit `<html>`.
    function html$6(node) {
      var head = siblings_1.after(node, -1);
      return !head || !comment$2(head)
    }

    // Whether to omit `<head>`.
    function head(node) {
      var children = node.children;
      var seen = [];
      var index = -1;

      while (++index < children.length) {
        if (hastUtilIsElement(children[index], ['title', 'base'])) {
          if (seen.indexOf(children[index].tagName) > -1) return false
          seen.push(children[index].tagName);
        }
      }

      return children.length
    }

    // Whether to omit `<body>`.
    function body$1(node) {
      var head = siblings_1.after(node, -1, true);

      return (
        !head ||
        (!comment$2(head) &&
          !whiteSpaceStart_1(head) &&
          !hastUtilIsElement(head, ['meta', 'link', 'script', 'style', 'template']))
      )
    }

    // Whether to omit `<colgroup>`.
    // The spec describes some logic for the opening tag, but it’s easier to
    // implement in the closing tag, to the same effect, so we handle it there
    // instead.
    function colgroup(node, index, parent) {
      var previous = siblings_1.before(parent, index);
      var head = siblings_1.after(node, -1, true);

      // Previous colgroup was already omitted.
      if (
        hastUtilIsElement(previous, 'colgroup') &&
        closing(previous, parent.children.indexOf(previous), parent)
      ) {
        return false
      }

      return head && hastUtilIsElement(head, 'col')
    }

    // Whether to omit `<tbody>`.
    function tbody$1(node, index, parent) {
      var previous = siblings_1.before(parent, index);
      var head = siblings_1.after(node, -1);

      // Previous table section was already omitted.
      if (
        hastUtilIsElement(previous, ['thead', 'tbody']) &&
        closing(previous, parent.children.indexOf(previous), parent)
      ) {
        return false
      }

      return head && hastUtilIsElement(head, 'tr')
    }

    var opening$1 = opening;
    var closing$1 = closing;

    var omission$1 = {
    	opening: opening$1,
    	closing: closing$1
    };

    var core$1 = encode$1;

    // Encode special characters in `value`.
    function encode$1(value, options) {
      value = value.replace(
        options.subset ? charactersToExpression(options.subset) : /["&'<>`]/g,
        basic
      );

      if (options.subset || options.escapeOnly) {
        return value
      }

      return (
        value
          // Surrogate pairs.
          .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, surrogate)
          // BMP control characters (C0 except for LF, CR, SP; DEL; and some more
          // non-ASCII ones).
          .replace(
            // eslint-disable-next-line no-control-regex, unicorn/no-hex-escape
            /[\x01-\t\v\f\x0E-\x1F\x7F\x81\x8D\x8F\x90\x9D\xA0-\uFFFF]/g,
            basic
          )
      )

      function surrogate(pair, index, all) {
        return options.format(
          (pair.charCodeAt(0) - 0xd800) * 0x400 +
            pair.charCodeAt(1) -
            0xdc00 +
            0x10000,
          all.charCodeAt(index + 2),
          options
        )
      }

      function basic(character, index, all) {
        return options.format(
          character.charCodeAt(0),
          all.charCodeAt(index + 1),
          options
        )
      }
    }

    function charactersToExpression(subset) {
      var groups = [];
      var index = -1;

      while (++index < subset.length) {
        groups.push(subset[index].replace(/[|\\{}()[\]^$+*?.]/g, '\\$&'));
      }

      return new RegExp('(?:' + groups.join('|') + ')', 'g')
    }

    var fromCharCode$1 = String.fromCharCode;

    var toHexadecimal = toHexReference;



    // Transform `code` into a hexadecimal character reference.
    function toHexReference(code, next, omit) {
      var value = '&#x' + code.toString(16).toUpperCase();
      return omit && next && !/[\dA-Fa-f]/.test(fromCharCode$1(next))
        ? value
        : value + ';'
    }

    var toDecimal = toDecimalReference;



    // Transform `code` into a decimal character reference.
    function toDecimalReference(code, next, omit) {
      var value = '&#' + String(code);
      return omit && next && !/\d/.test(fromCharCode$1(next)) ? value : value + ';'
    }

    var AElig = "Æ";
    var AMP = "&";
    var Aacute = "Á";
    var Acirc = "Â";
    var Agrave = "À";
    var Aring = "Å";
    var Atilde = "Ã";
    var Auml = "Ä";
    var COPY = "©";
    var Ccedil = "Ç";
    var ETH = "Ð";
    var Eacute = "É";
    var Ecirc = "Ê";
    var Egrave = "È";
    var Euml = "Ë";
    var GT = ">";
    var Iacute = "Í";
    var Icirc = "Î";
    var Igrave = "Ì";
    var Iuml = "Ï";
    var LT = "<";
    var Ntilde = "Ñ";
    var Oacute = "Ó";
    var Ocirc = "Ô";
    var Ograve = "Ò";
    var Oslash = "Ø";
    var Otilde = "Õ";
    var Ouml = "Ö";
    var QUOT = "\"";
    var REG = "®";
    var THORN = "Þ";
    var Uacute = "Ú";
    var Ucirc = "Û";
    var Ugrave = "Ù";
    var Uuml = "Ü";
    var Yacute = "Ý";
    var aacute = "á";
    var acirc = "â";
    var acute = "´";
    var aelig = "æ";
    var agrave = "à";
    var amp = "&";
    var aring = "å";
    var atilde = "ã";
    var auml = "ä";
    var brvbar = "¦";
    var ccedil = "ç";
    var cedil = "¸";
    var cent = "¢";
    var copy = "©";
    var curren = "¤";
    var deg = "°";
    var divide = "÷";
    var eacute = "é";
    var ecirc = "ê";
    var egrave = "è";
    var eth = "ð";
    var euml = "ë";
    var frac12 = "½";
    var frac14 = "¼";
    var frac34 = "¾";
    var gt = ">";
    var iacute = "í";
    var icirc = "î";
    var iexcl = "¡";
    var igrave = "ì";
    var iquest = "¿";
    var iuml = "ï";
    var laquo = "«";
    var lt = "<";
    var macr = "¯";
    var micro = "µ";
    var middot = "·";
    var nbsp = " ";
    var not = "¬";
    var ntilde = "ñ";
    var oacute = "ó";
    var ocirc = "ô";
    var ograve = "ò";
    var ordf = "ª";
    var ordm = "º";
    var oslash = "ø";
    var otilde = "õ";
    var ouml = "ö";
    var para = "¶";
    var plusmn = "±";
    var pound = "£";
    var quot = "\"";
    var raquo = "»";
    var reg = "®";
    var sect = "§";
    var shy = "­";
    var sup1 = "¹";
    var sup2 = "²";
    var sup3 = "³";
    var szlig = "ß";
    var thorn = "þ";
    var times = "×";
    var uacute = "ú";
    var ucirc = "û";
    var ugrave = "ù";
    var uml = "¨";
    var uuml = "ü";
    var yacute = "ý";
    var yen = "¥";
    var yuml = "ÿ";
    var legacy = {
    	AElig: AElig,
    	AMP: AMP,
    	Aacute: Aacute,
    	Acirc: Acirc,
    	Agrave: Agrave,
    	Aring: Aring,
    	Atilde: Atilde,
    	Auml: Auml,
    	COPY: COPY,
    	Ccedil: Ccedil,
    	ETH: ETH,
    	Eacute: Eacute,
    	Ecirc: Ecirc,
    	Egrave: Egrave,
    	Euml: Euml,
    	GT: GT,
    	Iacute: Iacute,
    	Icirc: Icirc,
    	Igrave: Igrave,
    	Iuml: Iuml,
    	LT: LT,
    	Ntilde: Ntilde,
    	Oacute: Oacute,
    	Ocirc: Ocirc,
    	Ograve: Ograve,
    	Oslash: Oslash,
    	Otilde: Otilde,
    	Ouml: Ouml,
    	QUOT: QUOT,
    	REG: REG,
    	THORN: THORN,
    	Uacute: Uacute,
    	Ucirc: Ucirc,
    	Ugrave: Ugrave,
    	Uuml: Uuml,
    	Yacute: Yacute,
    	aacute: aacute,
    	acirc: acirc,
    	acute: acute,
    	aelig: aelig,
    	agrave: agrave,
    	amp: amp,
    	aring: aring,
    	atilde: atilde,
    	auml: auml,
    	brvbar: brvbar,
    	ccedil: ccedil,
    	cedil: cedil,
    	cent: cent,
    	copy: copy,
    	curren: curren,
    	deg: deg,
    	divide: divide,
    	eacute: eacute,
    	ecirc: ecirc,
    	egrave: egrave,
    	eth: eth,
    	euml: euml,
    	frac12: frac12,
    	frac14: frac14,
    	frac34: frac34,
    	gt: gt,
    	iacute: iacute,
    	icirc: icirc,
    	iexcl: iexcl,
    	igrave: igrave,
    	iquest: iquest,
    	iuml: iuml,
    	laquo: laquo,
    	lt: lt,
    	macr: macr,
    	micro: micro,
    	middot: middot,
    	nbsp: nbsp,
    	not: not,
    	ntilde: ntilde,
    	oacute: oacute,
    	ocirc: ocirc,
    	ograve: ograve,
    	ordf: ordf,
    	ordm: ordm,
    	oslash: oslash,
    	otilde: otilde,
    	ouml: ouml,
    	para: para,
    	plusmn: plusmn,
    	pound: pound,
    	quot: quot,
    	raquo: raquo,
    	reg: reg,
    	sect: sect,
    	shy: shy,
    	sup1: sup1,
    	sup2: sup2,
    	sup3: sup3,
    	szlig: szlig,
    	thorn: thorn,
    	times: times,
    	uacute: uacute,
    	ucirc: ucirc,
    	ugrave: ugrave,
    	uml: uml,
    	uuml: uuml,
    	yacute: yacute,
    	yen: yen,
    	yuml: yuml
    };

    var nbsp$1 = " ";
    var iexcl$1 = "¡";
    var cent$1 = "¢";
    var pound$1 = "£";
    var curren$1 = "¤";
    var yen$1 = "¥";
    var brvbar$1 = "¦";
    var sect$1 = "§";
    var uml$1 = "¨";
    var copy$1 = "©";
    var ordf$1 = "ª";
    var laquo$1 = "«";
    var not$1 = "¬";
    var shy$1 = "­";
    var reg$1 = "®";
    var macr$1 = "¯";
    var deg$1 = "°";
    var plusmn$1 = "±";
    var sup2$1 = "²";
    var sup3$1 = "³";
    var acute$1 = "´";
    var micro$1 = "µ";
    var para$1 = "¶";
    var middot$1 = "·";
    var cedil$1 = "¸";
    var sup1$1 = "¹";
    var ordm$1 = "º";
    var raquo$1 = "»";
    var frac14$1 = "¼";
    var frac12$1 = "½";
    var frac34$1 = "¾";
    var iquest$1 = "¿";
    var Agrave$1 = "À";
    var Aacute$1 = "Á";
    var Acirc$1 = "Â";
    var Atilde$1 = "Ã";
    var Auml$1 = "Ä";
    var Aring$1 = "Å";
    var AElig$1 = "Æ";
    var Ccedil$1 = "Ç";
    var Egrave$1 = "È";
    var Eacute$1 = "É";
    var Ecirc$1 = "Ê";
    var Euml$1 = "Ë";
    var Igrave$1 = "Ì";
    var Iacute$1 = "Í";
    var Icirc$1 = "Î";
    var Iuml$1 = "Ï";
    var ETH$1 = "Ð";
    var Ntilde$1 = "Ñ";
    var Ograve$1 = "Ò";
    var Oacute$1 = "Ó";
    var Ocirc$1 = "Ô";
    var Otilde$1 = "Õ";
    var Ouml$1 = "Ö";
    var times$1 = "×";
    var Oslash$1 = "Ø";
    var Ugrave$1 = "Ù";
    var Uacute$1 = "Ú";
    var Ucirc$1 = "Û";
    var Uuml$1 = "Ü";
    var Yacute$1 = "Ý";
    var THORN$1 = "Þ";
    var szlig$1 = "ß";
    var agrave$1 = "à";
    var aacute$1 = "á";
    var acirc$1 = "â";
    var atilde$1 = "ã";
    var auml$1 = "ä";
    var aring$1 = "å";
    var aelig$1 = "æ";
    var ccedil$1 = "ç";
    var egrave$1 = "è";
    var eacute$1 = "é";
    var ecirc$1 = "ê";
    var euml$1 = "ë";
    var igrave$1 = "ì";
    var iacute$1 = "í";
    var icirc$1 = "î";
    var iuml$1 = "ï";
    var eth$1 = "ð";
    var ntilde$1 = "ñ";
    var ograve$1 = "ò";
    var oacute$1 = "ó";
    var ocirc$1 = "ô";
    var otilde$1 = "õ";
    var ouml$1 = "ö";
    var divide$1 = "÷";
    var oslash$1 = "ø";
    var ugrave$1 = "ù";
    var uacute$1 = "ú";
    var ucirc$1 = "û";
    var uuml$1 = "ü";
    var yacute$1 = "ý";
    var thorn$1 = "þ";
    var yuml$1 = "ÿ";
    var fnof = "ƒ";
    var Alpha = "Α";
    var Beta = "Β";
    var Gamma = "Γ";
    var Delta = "Δ";
    var Epsilon = "Ε";
    var Zeta = "Ζ";
    var Eta = "Η";
    var Theta = "Θ";
    var Iota = "Ι";
    var Kappa = "Κ";
    var Lambda = "Λ";
    var Mu = "Μ";
    var Nu = "Ν";
    var Xi = "Ξ";
    var Omicron = "Ο";
    var Pi = "Π";
    var Rho = "Ρ";
    var Sigma = "Σ";
    var Tau = "Τ";
    var Upsilon = "Υ";
    var Phi = "Φ";
    var Chi = "Χ";
    var Psi = "Ψ";
    var Omega = "Ω";
    var alpha = "α";
    var beta = "β";
    var gamma = "γ";
    var delta = "δ";
    var epsilon = "ε";
    var zeta = "ζ";
    var eta = "η";
    var theta = "θ";
    var iota = "ι";
    var kappa = "κ";
    var lambda = "λ";
    var mu = "μ";
    var nu = "ν";
    var xi = "ξ";
    var omicron = "ο";
    var pi = "π";
    var rho = "ρ";
    var sigmaf = "ς";
    var sigma = "σ";
    var tau = "τ";
    var upsilon = "υ";
    var phi = "φ";
    var chi = "χ";
    var psi = "ψ";
    var omega = "ω";
    var thetasym = "ϑ";
    var upsih = "ϒ";
    var piv = "ϖ";
    var bull = "•";
    var hellip = "…";
    var prime = "′";
    var Prime = "″";
    var oline = "‾";
    var frasl = "⁄";
    var weierp = "℘";
    var image$1 = "ℑ";
    var real = "ℜ";
    var trade = "™";
    var alefsym = "ℵ";
    var larr = "←";
    var uarr = "↑";
    var rarr = "→";
    var darr = "↓";
    var harr = "↔";
    var crarr = "↵";
    var lArr = "⇐";
    var uArr = "⇑";
    var rArr = "⇒";
    var dArr = "⇓";
    var hArr = "⇔";
    var forall = "∀";
    var part = "∂";
    var exist = "∃";
    var empty$3 = "∅";
    var nabla = "∇";
    var isin = "∈";
    var notin = "∉";
    var ni = "∋";
    var prod = "∏";
    var sum = "∑";
    var minus = "−";
    var lowast = "∗";
    var radic = "√";
    var prop = "∝";
    var infin = "∞";
    var ang = "∠";
    var and = "∧";
    var or = "∨";
    var cap$1 = "∩";
    var cup = "∪";
    var int = "∫";
    var there4 = "∴";
    var sim = "∼";
    var cong = "≅";
    var asymp = "≈";
    var ne = "≠";
    var equiv = "≡";
    var le = "≤";
    var ge = "≥";
    var sub = "⊂";
    var sup = "⊃";
    var nsub = "⊄";
    var sube = "⊆";
    var supe = "⊇";
    var oplus = "⊕";
    var otimes = "⊗";
    var perp = "⊥";
    var sdot = "⋅";
    var lceil = "⌈";
    var rceil = "⌉";
    var lfloor = "⌊";
    var rfloor = "⌋";
    var lang = "〈";
    var rang = "〉";
    var loz = "◊";
    var spades = "♠";
    var clubs = "♣";
    var hearts = "♥";
    var diams = "♦";
    var quot$1 = "\"";
    var amp$1 = "&";
    var lt$1 = "<";
    var gt$1 = ">";
    var OElig = "Œ";
    var oelig = "œ";
    var Scaron = "Š";
    var scaron = "š";
    var Yuml = "Ÿ";
    var circ = "ˆ";
    var tilde = "˜";
    var ensp = " ";
    var emsp = " ";
    var thinsp = " ";
    var zwnj = "‌";
    var zwj = "‍";
    var lrm = "‎";
    var rlm = "‏";
    var ndash = "–";
    var mdash = "—";
    var lsquo = "‘";
    var rsquo = "’";
    var sbquo = "‚";
    var ldquo = "“";
    var rdquo = "”";
    var bdquo = "„";
    var dagger = "†";
    var Dagger = "‡";
    var permil = "‰";
    var lsaquo = "‹";
    var rsaquo = "›";
    var euro = "€";
    var entities = {
    	nbsp: nbsp$1,
    	iexcl: iexcl$1,
    	cent: cent$1,
    	pound: pound$1,
    	curren: curren$1,
    	yen: yen$1,
    	brvbar: brvbar$1,
    	sect: sect$1,
    	uml: uml$1,
    	copy: copy$1,
    	ordf: ordf$1,
    	laquo: laquo$1,
    	not: not$1,
    	shy: shy$1,
    	reg: reg$1,
    	macr: macr$1,
    	deg: deg$1,
    	plusmn: plusmn$1,
    	sup2: sup2$1,
    	sup3: sup3$1,
    	acute: acute$1,
    	micro: micro$1,
    	para: para$1,
    	middot: middot$1,
    	cedil: cedil$1,
    	sup1: sup1$1,
    	ordm: ordm$1,
    	raquo: raquo$1,
    	frac14: frac14$1,
    	frac12: frac12$1,
    	frac34: frac34$1,
    	iquest: iquest$1,
    	Agrave: Agrave$1,
    	Aacute: Aacute$1,
    	Acirc: Acirc$1,
    	Atilde: Atilde$1,
    	Auml: Auml$1,
    	Aring: Aring$1,
    	AElig: AElig$1,
    	Ccedil: Ccedil$1,
    	Egrave: Egrave$1,
    	Eacute: Eacute$1,
    	Ecirc: Ecirc$1,
    	Euml: Euml$1,
    	Igrave: Igrave$1,
    	Iacute: Iacute$1,
    	Icirc: Icirc$1,
    	Iuml: Iuml$1,
    	ETH: ETH$1,
    	Ntilde: Ntilde$1,
    	Ograve: Ograve$1,
    	Oacute: Oacute$1,
    	Ocirc: Ocirc$1,
    	Otilde: Otilde$1,
    	Ouml: Ouml$1,
    	times: times$1,
    	Oslash: Oslash$1,
    	Ugrave: Ugrave$1,
    	Uacute: Uacute$1,
    	Ucirc: Ucirc$1,
    	Uuml: Uuml$1,
    	Yacute: Yacute$1,
    	THORN: THORN$1,
    	szlig: szlig$1,
    	agrave: agrave$1,
    	aacute: aacute$1,
    	acirc: acirc$1,
    	atilde: atilde$1,
    	auml: auml$1,
    	aring: aring$1,
    	aelig: aelig$1,
    	ccedil: ccedil$1,
    	egrave: egrave$1,
    	eacute: eacute$1,
    	ecirc: ecirc$1,
    	euml: euml$1,
    	igrave: igrave$1,
    	iacute: iacute$1,
    	icirc: icirc$1,
    	iuml: iuml$1,
    	eth: eth$1,
    	ntilde: ntilde$1,
    	ograve: ograve$1,
    	oacute: oacute$1,
    	ocirc: ocirc$1,
    	otilde: otilde$1,
    	ouml: ouml$1,
    	divide: divide$1,
    	oslash: oslash$1,
    	ugrave: ugrave$1,
    	uacute: uacute$1,
    	ucirc: ucirc$1,
    	uuml: uuml$1,
    	yacute: yacute$1,
    	thorn: thorn$1,
    	yuml: yuml$1,
    	fnof: fnof,
    	Alpha: Alpha,
    	Beta: Beta,
    	Gamma: Gamma,
    	Delta: Delta,
    	Epsilon: Epsilon,
    	Zeta: Zeta,
    	Eta: Eta,
    	Theta: Theta,
    	Iota: Iota,
    	Kappa: Kappa,
    	Lambda: Lambda,
    	Mu: Mu,
    	Nu: Nu,
    	Xi: Xi,
    	Omicron: Omicron,
    	Pi: Pi,
    	Rho: Rho,
    	Sigma: Sigma,
    	Tau: Tau,
    	Upsilon: Upsilon,
    	Phi: Phi,
    	Chi: Chi,
    	Psi: Psi,
    	Omega: Omega,
    	alpha: alpha,
    	beta: beta,
    	gamma: gamma,
    	delta: delta,
    	epsilon: epsilon,
    	zeta: zeta,
    	eta: eta,
    	theta: theta,
    	iota: iota,
    	kappa: kappa,
    	lambda: lambda,
    	mu: mu,
    	nu: nu,
    	xi: xi,
    	omicron: omicron,
    	pi: pi,
    	rho: rho,
    	sigmaf: sigmaf,
    	sigma: sigma,
    	tau: tau,
    	upsilon: upsilon,
    	phi: phi,
    	chi: chi,
    	psi: psi,
    	omega: omega,
    	thetasym: thetasym,
    	upsih: upsih,
    	piv: piv,
    	bull: bull,
    	hellip: hellip,
    	prime: prime,
    	Prime: Prime,
    	oline: oline,
    	frasl: frasl,
    	weierp: weierp,
    	image: image$1,
    	real: real,
    	trade: trade,
    	alefsym: alefsym,
    	larr: larr,
    	uarr: uarr,
    	rarr: rarr,
    	darr: darr,
    	harr: harr,
    	crarr: crarr,
    	lArr: lArr,
    	uArr: uArr,
    	rArr: rArr,
    	dArr: dArr,
    	hArr: hArr,
    	forall: forall,
    	part: part,
    	exist: exist,
    	empty: empty$3,
    	nabla: nabla,
    	isin: isin,
    	notin: notin,
    	ni: ni,
    	prod: prod,
    	sum: sum,
    	minus: minus,
    	lowast: lowast,
    	radic: radic,
    	prop: prop,
    	infin: infin,
    	ang: ang,
    	and: and,
    	or: or,
    	cap: cap$1,
    	cup: cup,
    	int: int,
    	there4: there4,
    	sim: sim,
    	cong: cong,
    	asymp: asymp,
    	ne: ne,
    	equiv: equiv,
    	le: le,
    	ge: ge,
    	sub: sub,
    	sup: sup,
    	nsub: nsub,
    	sube: sube,
    	supe: supe,
    	oplus: oplus,
    	otimes: otimes,
    	perp: perp,
    	sdot: sdot,
    	lceil: lceil,
    	rceil: rceil,
    	lfloor: lfloor,
    	rfloor: rfloor,
    	lang: lang,
    	rang: rang,
    	loz: loz,
    	spades: spades,
    	clubs: clubs,
    	hearts: hearts,
    	diams: diams,
    	quot: quot$1,
    	amp: amp$1,
    	lt: lt$1,
    	gt: gt$1,
    	OElig: OElig,
    	oelig: oelig,
    	Scaron: Scaron,
    	scaron: scaron,
    	Yuml: Yuml,
    	circ: circ,
    	tilde: tilde,
    	ensp: ensp,
    	emsp: emsp,
    	thinsp: thinsp,
    	zwnj: zwnj,
    	zwj: zwj,
    	lrm: lrm,
    	rlm: rlm,
    	ndash: ndash,
    	mdash: mdash,
    	lsquo: lsquo,
    	rsquo: rsquo,
    	sbquo: sbquo,
    	ldquo: ldquo,
    	rdquo: rdquo,
    	bdquo: bdquo,
    	dagger: dagger,
    	Dagger: Dagger,
    	permil: permil,
    	lsaquo: lsaquo,
    	rsaquo: rsaquo,
    	euro: euro
    };

    var characters = {};
    var name;

    var characters_1 = characters;

    for (name in entities) {
      characters[entities[name]] = name;
    }

    var hasOwnProperty_1$1 = {}.hasOwnProperty;

    var dangerous = [
    	"cent",
    	"copy",
    	"divide",
    	"gt",
    	"lt",
    	"not",
    	"para",
    	"times"
    ];

    var toNamed_1 = toNamed;







    // Transform `code` into a named character reference.
    function toNamed(code, next, omit, attribute) {
      var character = fromCharCode$1(code);
      var name;
      var value;

      if (hasOwnProperty_1$1.call(characters_1, character)) {
        name = characters_1[character];
        value = '&' + name;

        if (
          omit &&
          hasOwnProperty_1$1.call(legacy, name) &&
          dangerous.indexOf(name) === -1 &&
          (!attribute ||
            (next && next !== 61 /* `=` */ && /[^\da-z]/i.test(fromCharCode$1(next))))
        ) {
          return value
        }

        return value + ';'
      }

      return ''
    }

    var formatSmart = formatPretty;





    // Encode `character` according to `options`.
    function formatPretty(code, next, options) {
      var named;
      var numeric;
      var decimal;

      if (options.useNamedReferences || options.useShortestReferences) {
        named = toNamed_1(
          code,
          next,
          options.omitOptionalSemicolons,
          options.attribute
        );
      }

      if (options.useShortestReferences || !named) {
        numeric = toHexadecimal(code, next, options.omitOptionalSemicolons);

        // Use the shortest numeric reference when requested.
        // A simple algorithm would use decimal for all code points under 100, as
        // those are shorter than hexadecimal:
        //
        // * `&#99;` vs `&#x63;` (decimal shorter)
        // * `&#100;` vs `&#x64;` (equal)
        //
        // However, because we take `next` into consideration when `omit` is used,
        // And it would be possible that decimals are shorter on bigger values as
        // well if `next` is hexadecimal but not decimal, we instead compare both.
        if (options.useShortestReferences) {
          decimal = toDecimal(code, next, options.omitOptionalSemicolons);

          if (decimal.length < numeric.length) {
            numeric = decimal;
          }
        }
      }

      return named &&
        (!options.useShortestReferences || named.length < numeric.length)
        ? named
        : numeric
    }

    var encode_1$1 = encode$2;

    // Encode special characters in `value`.
    function encode$2(value, options) {
      // Note: Switch to `Object.assign` next major.
      return core$1(value, immutable(options, {format: formatSmart}))
    }

    var _escape = escape;

    // Shortcut to escape special characters in HTML.
    function escape(value) {
      return core$1(value, {
        escapeOnly: true,
        useNamedReferences: true,
        format: formatSmart
      })
    }

    var lib$3 = encode_1$1;
    encode_1$1.escape = _escape;

    var stringifyEntities = lib$3;

    var comment$3 = serializeComment;

    function serializeComment(ctx, node) {
      // See: <https://html.spec.whatwg.org/multipage/syntax.html#comments>
      return ctx.bogusComments
        ? '<?' + stringifyEntities(node.value, immutable(ctx.entities, {subset: ['>']})) + '>'
        : '<!--' + node.value.replace(/^>|^->|<!--|-->|--!>|<!-$/g, encode) + '-->'

      function encode($0) {
        return stringifyEntities($0, immutable(ctx.entities, {subset: ['<', '>']}))
      }
    }

    var ccount_1 = ccount;

    function ccount(source, character) {
      var value = String(source);
      var count = 0;
      var index;

      if (typeof character !== 'string') {
        throw new Error('Expected character')
      }

      index = value.indexOf(character);

      while (index !== -1) {
        count++;
        index = value.indexOf(character, index + character.length);
      }

      return count
    }

    var doctype$3 = serializeDoctype;

    function serializeDoctype(ctx, node) {
      var sep = ctx.tightDoctype ? '' : ' ';
      var parts = ['<!' + (ctx.upperDoctype ? 'DOCTYPE' : 'doctype')];

      if (node.name) {
        parts.push(sep, node.name);

        if (node.public != null) {
          parts.push(' public', sep, quote(ctx, node.public));
        } else if (node.system != null) {
          parts.push(' system');
        }

        if (node.system != null) {
          parts.push(sep, quote(ctx, node.system));
        }
      }

      return parts.join('') + '>'
    }

    function quote(ctx, value) {
      var string = String(value);
      var quote =
        ccount_1(string, ctx.quote) > ccount_1(string, ctx.alternative)
          ? ctx.alternative
          : ctx.quote;

      return (
        quote +
        stringifyEntities(string, immutable(ctx.entities, {subset: ['<', '&', quote]})) +
        quote
      )
    }

    var all_1$1 = all$3;

    // Serialize all children of `parent`.
    function all$3(ctx, parent) {
      var results = [];
      var children = (parent && parent.children) || [];
      var index = -1;

      while (++index < children.length) {
        results[index] = one$3(ctx, children[index], index, parent);
      }

      return results.join('')
    }

    // Maps of subsets.
    // Each value is a matrix of tuples.
    // The first value causes parse errors, the second is valid.
    // Of both values, the first value is unsafe, and the second is safe.
    var constants = {
      // See: <https://html.spec.whatwg.org/#attribute-name-state>.
      name: [
        ['\t\n\f\r &/=>'.split(''), '\t\n\f\r "&\'/=>`'.split('')],
        ['\0\t\n\f\r "&\'/<=>'.split(''), '\0\t\n\f\r "&\'/<=>`'.split('')]
      ],
      // See: <https://html.spec.whatwg.org/#attribute-value-(unquoted)-state>.
      unquoted: [
        ['\t\n\f\r &>'.split(''), '\0\t\n\f\r "&\'<=>`'.split('')],
        ['\0\t\n\f\r "&\'<=>`'.split(''), '\0\t\n\f\r "&\'<=>`'.split('')]
      ],
      // See: <https://html.spec.whatwg.org/#attribute-value-(single-quoted)-state>.
      single: [
        ["&'".split(''), '"&\'`'.split('')],
        ["\0&'".split(''), '\0"&\'`'.split('')]
      ],
      // See: <https://html.spec.whatwg.org/#attribute-value-(double-quoted)-state>.
      double: [
        ['"&'.split(''), '"&\'`'.split('')],
        ['\0"&'.split(''), '\0"&\'`'.split('')]
      ]
    };

    var element$5 = serializeElement;

    function serializeElement(ctx, node, index, parent) {
      var schema = ctx.schema;
      var omit = schema.space === 'svg' ? false : ctx.omit;
      var parts = [];
      var selfClosing =
        schema.space === 'svg'
          ? ctx.closeEmpty
          : ctx.voids.indexOf(node.tagName.toLowerCase()) > -1;
      var attrs = serializeAttributes(ctx, node.properties);
      var content;
      var last;

      if (schema.space === 'html' && node.tagName === 'svg') {
        ctx.schema = svg_1;
      }

      content = all_1$1(
        ctx,
        schema.space === 'html' && node.tagName === 'template' ? node.content : node
      );

      ctx.schema = schema;

      // If the node is categorised as void, but it has children, remove the
      // categorisation.
      // This enables for example `menuitem`s, which are void in W3C HTML but not
      // void in WHATWG HTML, to be stringified properly.
      if (content) selfClosing = false;

      if (attrs || !omit || !omit.opening(node, index, parent)) {
        parts.push('<', node.tagName, attrs ? ' ' + attrs : '');

        if (selfClosing && (schema.space === 'svg' || ctx.close)) {
          last = attrs.charAt(attrs.length - 1);
          if (
            !ctx.tightClose ||
            last === '/' ||
            (schema.space === 'svg' && last && last !== '"' && last !== "'")
          ) {
            parts.push(' ');
          }

          parts.push('/');
        }

        parts.push('>');
      }

      parts.push(content);

      if (!selfClosing && (!omit || !omit.closing(node, index, parent))) {
        parts.push('</' + node.tagName + '>');
      }

      return parts.join('')
    }

    function serializeAttributes(ctx, props) {
      var values = [];
      var index = -1;
      var key;
      var value;
      var last;

      for (key in props) {
        if (props[key] != null) {
          value = serializeAttribute(ctx, key, props[key]);
          if (value) values.push(value);
        }
      }

      while (++index < values.length) {
        last = ctx.tight ? values[index].charAt(values[index].length - 1) : null;

        // In tight mode, don’t add a space after quoted attributes.
        if (index !== values.length - 1 && last !== '"' && last !== "'") {
          values[index] += ' ';
        }
      }

      return values.join('')
    }

    function serializeAttribute(ctx, key, value) {
      var info = find_1(ctx.schema, key);
      var quote = ctx.quote;
      var result;
      var name;

      if (info.overloadedBoolean && (value === info.attribute || value === '')) {
        value = true;
      } else if (
        info.boolean ||
        (info.overloadedBoolean && typeof value !== 'string')
      ) {
        value = Boolean(value);
      }

      if (
        value == null ||
        value === false ||
        (typeof value === 'number' && value !== value)
      ) {
        return ''
      }

      name = stringifyEntities(
        info.attribute,
        immutable(ctx.entities, {
          // Always encode without parse errors in non-HTML.
          subset:
            constants.name[ctx.schema.space === 'html' ? ctx.valid : 1][ctx.safe]
        })
      );

      // No value.
      // There is currently only one boolean property in SVG: `[download]` on
      // `<a>`.
      // This property does not seem to work in browsers (FF, Sa, Ch), so I can’t
      // test if dropping the value works.
      // But I assume that it should:
      //
      // ```html
      // <!doctype html>
      // <svg viewBox="0 0 100 100">
      //   <a href=https://example.com download>
      //     <circle cx=50 cy=40 r=35 />
      //   </a>
      // </svg>
      // ```
      //
      // See: <https://github.com/wooorm/property-information/blob/main/lib/svg.js>
      if (value === true) return name

      value =
        typeof value === 'object' && 'length' in value
          ? // `spaces` doesn’t accept a second argument, but it’s given here just to
            // keep the code cleaner.
            (info.commaSeparated ? commaSeparatedTokens.stringify : spaceSeparatedTokens.stringify)(value, {
              padLeft: !ctx.tightLists
            })
          : String(value);

      if (ctx.collapseEmpty && !value) return name

      // Check unquoted value.
      if (ctx.unquoted) {
        result = stringifyEntities(
          value,
          immutable(ctx.entities, {
            subset: constants.unquoted[ctx.valid][ctx.safe],
            attribute: true
          })
        );
      }

      // If we don’t want unquoted, or if `value` contains character references when
      // unquoted…
      if (result !== value) {
        // If the alternative is less common than `quote`, switch.
        if (ctx.smart && ccount_1(value, quote) > ccount_1(value, ctx.alternative)) {
          quote = ctx.alternative;
        }

        result =
          quote +
          stringifyEntities(
            value,
            immutable(ctx.entities, {
              // Always encode without parse errors in non-HTML.
              subset: (quote === "'" ? constants.single : constants.double)[
                ctx.schema.space === 'html' ? ctx.valid : 1
              ][ctx.safe],
              attribute: true
            })
          ) +
          quote;
      }

      // Don’t add a `=` for unquoted empties.
      return name + (result ? '=' + result : result)
    }

    var text$6 = serializeText;

    function serializeText(ctx, node, index, parent) {
      // Check if content of `node` should be escaped.
      return parent && (parent.tagName === 'script' || parent.tagName === 'style')
        ? node.value
        : stringifyEntities(node.value, immutable(ctx.entities, {subset: ['<', '&']}))
    }

    var raw$1 = serializeRaw;

    function serializeRaw(ctx, node) {
      return ctx.dangerous ? node.value : text$6(ctx, node)
    }

    var one$3 = serialize;

    var handlers$1 = {
      comment: comment$3,
      doctype: doctype$3,
      element: element$5,
      raw: raw$1,
      root: all_1$1,
      text: text$6
    };

    var own$c = {}.hasOwnProperty;

    function serialize(ctx, node, index, parent) {
      if (!node || !node.type) {
        throw new Error('Expected node, not `' + node + '`')
      }

      if (!own$c.call(handlers$1, node.type)) {
        throw new Error('Cannot compile unknown node `' + node.type + '`')
      }

      return handlers$1[node.type](ctx, node, index, parent)
    }

    var lib$4 = toHtml;

    var deprecationWarningIssued$1;

    function toHtml(node, options) {
      var settings = options || {};
      var quote = settings.quote || '"';
      var alternative = quote === '"' ? "'" : '"';

      if (quote !== '"' && quote !== "'") {
        throw new Error('Invalid quote `' + quote + '`, expected `\'` or `"`')
      }

      if ('allowDangerousHTML' in settings && !deprecationWarningIssued$1) {
        deprecationWarningIssued$1 = true;
        console.warn(
          'Deprecation warning: `allowDangerousHTML` is a nonstandard option, use `allowDangerousHtml` instead'
        );
      }

      return one$3(
        {
          valid: settings.allowParseErrors ? 0 : 1,
          safe: settings.allowDangerousCharacters ? 0 : 1,
          schema: settings.space === 'svg' ? svg_1 : html_1$1,
          omit: settings.omitOptionalTags && omission$1,
          quote: quote,
          alternative: alternative,
          smart: settings.quoteSmart,
          unquoted: settings.preferUnquoted,
          tight: settings.tightAttributes,
          upperDoctype: settings.upperDoctype,
          tightDoctype: settings.tightDoctype,
          bogusComments: settings.bogusComments,
          tightLists: settings.tightCommaSeparatedLists,
          tightClose: settings.tightSelfClosing,
          collapseEmpty: settings.collapseEmptyAttributes,
          dangerous: settings.allowDangerousHtml || settings.allowDangerousHTML,
          voids: settings.voids || voids.concat(),
          entities: settings.entities || {},
          close: settings.closeSelfClosing,
          closeEmpty: settings.closeEmptyElements
        },
        node && typeof node === 'object' && 'length' in node
          ? {type: 'root', children: node}
          : node
      )
    }

    var hastUtilToHtml = lib$4;

    var rehypeStringify = stringify$3;

    function stringify$3(config) {
      var settings = Object.assign({}, config, this.data('settings'));

      this.Compiler = compiler;

      function compiler(tree) {
        return hastUtilToHtml(tree, settings)
      }
    }

    const schemaStr = JSON.stringify(ghSchema);
    /**
     * Get unified processor with ByteMD plugins
     */
    function getProcessor({ sanitize, plugins, }) {
        let p = unified_1().use(remarkParse);
        plugins === null || plugins === void 0 ? void 0 : plugins.forEach(({ remark }) => {
            if (remark)
                p = remark(p);
        });
        p = p.use(remarkRehype, { allowDangerousHtml: true }).use(rehypeRaw);
        let schema = JSON.parse(schemaStr);
        schema.attributes['*'].push('className'); // Add className
        if (sanitize)
            schema = sanitize(schema);
        p = p.use(rehypeSanitize, schema);
        plugins === null || plugins === void 0 ? void 0 : plugins.forEach(({ rehype }) => {
            if (rehype)
                p = rehype(p);
        });
        return p.use(rehypeStringify);
    }

    /* node_modules/bytemd/lib/viewer.svelte generated by Svelte v3.31.2 */

    function create_fragment(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");
    			attr(div, "class", "markdown-body");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			div.innerHTML = /*html*/ ctx[1];
    			/*div_binding*/ ctx[6](div);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*html*/ 2) div.innerHTML = /*html*/ ctx[1];		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			/*div_binding*/ ctx[6](null);
    		}
    	};
    }

    function hashCode(s) {
    	var h = 0, l = s.length, i = 0;
    	if (l > 0) while (i < l) h = (h << 5) - h + s.charCodeAt(i++) | 0;
    	return h;
    }

    function instance($$self, $$props, $$invalidate) {
    	let html;
    	
    	
    	let { value = "" } = $$props;
    	let { plugins } = $$props;
    	let { sanitize } = $$props;
    	const dispatch = createEventDispatcher();
    	let el;
    	let cbs = [];

    	function on() {
    		cbs = (plugins !== null && plugins !== void 0 ? plugins : []).map(p => {
    			var _a;

    			return (_a = p.viewerEffect) === null || _a === void 0
    			? void 0
    			: _a.call(p, { $el: el, result });
    		});
    	}

    	function off() {
    		cbs.forEach(cb => cb && cb());
    	}

    	onMount(() => {
    		el.addEventListener("click", e => {
    			var _a;
    			const $ = e.target;
    			if ($.tagName !== "A") return;
    			const href = $.getAttribute("href");

    			if (!(href === null || href === void 0
    			? void 0
    			: href.startsWith("#"))) return;

    			(_a = el.querySelector("#user-content-" + href.slice(1))) === null || _a === void 0
    			? void 0
    			: _a.scrollIntoView();
    		});
    	});

    	onDestroy(off);
    	let result;

    	function div_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			el = $$value;
    			$$invalidate(0, el);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ("value" in $$props) $$invalidate(2, value = $$props.value);
    		if ("plugins" in $$props) $$invalidate(3, plugins = $$props.plugins);
    		if ("sanitize" in $$props) $$invalidate(4, sanitize = $$props.sanitize);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*plugins, sanitize, value*/ 28) {
    			 try {
    				const processor = getProcessor({
    					plugins: [
    						...plugins !== null && plugins !== void 0 ? plugins : [],
    						{
    							rehype: p => p.use(() => tree => {
    								// wait the next tick to make sure the initial AST could be dispatched
    								tick().then(() => {
    									dispatch("hast", tree);
    								});
    							})
    						}
    					],
    					sanitize
    				});

    				$$invalidate(5, result = processor.processSync(value));
    			} catch(err) {
    				console.error(err);
    			}
    		}

    		if ($$self.$$.dirty & /*value, result*/ 36) {
    			 $$invalidate(1, html = `<!--${hashCode(value)}-->${result}`); // trigger re-render every time the value changes
    		}

    		if ($$self.$$.dirty & /*result, plugins*/ 40) {
    			 if (result && plugins) {
    				off();

    				tick().then(() => {
    					on();
    				});
    			}
    		}
    	};

    	return [el, html, value, plugins, sanitize, result, div_binding];
    }

    class Viewer extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, not_equal, { value: 2, plugins: 3, sanitize: 4 });
    	}
    }

    /* src/components/MarkdownViewer.svelte generated by Svelte v3.31.2 */

    function create_fragment$1(ctx) {
    	let article;
    	let viewer;
    	let current;
    	viewer = new Viewer({ props: { value: /*content*/ ctx[0] } });

    	return {
    		c() {
    			article = element("article");
    			create_component(viewer.$$.fragment);
    			attr(article, "class", "markdown-body");
    		},
    		m(target, anchor) {
    			insert(target, article, anchor);
    			mount_component(viewer, article, null);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const viewer_changes = {};
    			if (dirty & /*content*/ 1) viewer_changes.value = /*content*/ ctx[0];
    			viewer.$set(viewer_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(viewer.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(viewer.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(article);
    			destroy_component(viewer);
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { content } = $$props;

    	$$self.$$set = $$props => {
    		if ("content" in $$props) $$invalidate(0, content = $$props.content);
    	};

    	return [content];
    }

    class MarkdownViewer extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { content: 0 });
    	}
    }

    /* src/App.svelte generated by Svelte v3.31.2 */

    function create_catch_block(ctx) {
    	return {
    		c: noop,
    		m: noop,
    		p: noop,
    		i: noop,
    		o: noop,
    		d: noop
    	};
    }

    // (16:25)   <MarkdownViewer content={text.split("<!--header--->").slice(1).join("")}
    function create_then_block(ctx) {
    	let markdownviewer;
    	let current;

    	markdownviewer = new MarkdownViewer({
    			props: {
    				content: /*text*/ ctx[1].split("<!--header--->").slice(1).join("")
    			}
    		});

    	return {
    		c() {
    			create_component(markdownviewer.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(markdownviewer, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(markdownviewer.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(markdownviewer.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(markdownviewer, detaching);
    		}
    	};
    }

    // (1:0) <script lang="ts">  import MarkdownViewer from './components/MarkdownViewer.svelte';   async function get_readme() {   return fetch("https://api.github.com/repos/EnzoDiazDev/EnzoDiazDev/contents/README.md", {    headers: {     "accept": "application/vnd.github.VERSION.raw"    }
    function create_pending_block(ctx) {
    	return {
    		c: noop,
    		m: noop,
    		p: noop,
    		i: noop,
    		o: noop,
    		d: noop
    	};
    }

    function create_fragment$2(ctx) {
    	let await_block_anchor;
    	let current;

    	let info = {
    		ctx,
    		current: null,
    		token: null,
    		hasCatch: false,
    		pending: create_pending_block,
    		then: create_then_block,
    		catch: create_catch_block,
    		value: 1,
    		blocks: [,,,]
    	};

    	handle_promise(ctx[0], info);

    	return {
    		c() {
    			await_block_anchor = empty();
    			info.block.c();
    		},
    		m(target, anchor) {
    			insert(target, await_block_anchor, anchor);
    			info.block.m(target, info.anchor = anchor);
    			info.mount = () => await_block_anchor.parentNode;
    			info.anchor = await_block_anchor;
    			current = true;
    		},
    		p(new_ctx, [dirty]) {
    			ctx = new_ctx;

    			{
    				const child_ctx = ctx.slice();
    				child_ctx[1] = info.resolved;
    				info.block.p(child_ctx, dirty);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(info.block);
    			current = true;
    		},
    		o(local) {
    			for (let i = 0; i < 3; i += 1) {
    				const block = info.blocks[i];
    				transition_out(block);
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(await_block_anchor);
    			info.block.d(detaching);
    			info.token = null;
    			info = null;
    		}
    	};
    }

    async function get_readme() {
    	return fetch("https://api.github.com/repos/EnzoDiazDev/EnzoDiazDev/contents/README.md", {
    		headers: {
    			"accept": "application/vnd.github.VERSION.raw"
    		}
    	}).then(response => response.body.getReader().read()).then(uintarray => new TextDecoder("utf-8").decode(uintarray.value));
    }

    function instance$2($$self) {
    	let readme = get_readme();
    	return [readme];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {});
    	}
    }

    const app = new App({
        target: document.getElementById("viewer")
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
