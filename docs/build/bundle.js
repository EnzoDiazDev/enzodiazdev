var app=function(){"use strict";function t(){}function e(t){return t()}function n(){return Object.create(null)}function o(t){t.forEach(e)}function r(t){return"function"==typeof t}function c(t,e){return t!=t?e==e:t!==e||t&&"object"==typeof t||"function"==typeof t}function s(t,e){t.appendChild(e)}function i(t){t.parentNode.removeChild(t)}function u(t){return document.createElement(t)}function a(t){return document.createTextNode(t)}function l(t,e,n){null==n?t.removeAttribute(e):t.getAttribute(e)!==n&&t.setAttribute(e,n)}let f;function d(t){f=t}const p=[],h=[],m=[],$=[],g=Promise.resolve();let b=!1;function y(t){m.push(t)}let _=!1;const x=new Set;function v(){if(!_){_=!0;do{for(let t=0;t<p.length;t+=1){const e=p[t];d(e),j(e.$$)}for(d(null),p.length=0;h.length;)h.pop()();for(let t=0;t<m.length;t+=1){const e=m[t];x.has(e)||(x.add(e),e())}m.length=0}while(p.length);for(;$.length;)$.pop()();b=!1,_=!1,x.clear()}}function j(t){if(null!==t.fragment){t.update(),o(t.before_update);const e=t.dirty;t.dirty=[-1],t.fragment&&t.fragment.p(t.ctx,e),t.after_update.forEach(y)}}const k=new Set;function w(t,e){-1===t.$$.dirty[0]&&(p.push(t),b||(b=!0,g.then(v)),t.$$.dirty.fill(0)),t.$$.dirty[e/31|0]|=1<<e%31}function E(c,s,u,a,l,p,h=[-1]){const m=f;d(c);const $=s.props||{},g=c.$$={fragment:null,ctx:null,props:p,update:t,not_equal:l,bound:n(),on_mount:[],on_destroy:[],before_update:[],after_update:[],context:new Map(m?m.$$.context:[]),callbacks:n(),dirty:h,skip_bound:!1};let b=!1;if(g.ctx=u?u(c,$,((t,e,...n)=>{const o=n.length?n[0]:e;return g.ctx&&l(g.ctx[t],g.ctx[t]=o)&&(!g.skip_bound&&g.bound[t]&&g.bound[t](o),b&&w(c,t)),e})):[],g.update(),b=!0,o(g.before_update),g.fragment=!!a&&a(g.ctx),s.target){if(s.hydrate){const t=function(t){return Array.from(t.childNodes)}(s.target);g.fragment&&g.fragment.l(t),t.forEach(i)}else g.fragment&&g.fragment.c();s.intro&&((_=c.$$.fragment)&&_.i&&(k.delete(_),_.i(x))),function(t,n,c){const{fragment:s,on_mount:i,on_destroy:u,after_update:a}=t.$$;s&&s.m(n,c),y((()=>{const n=i.map(e).filter(r);u?u.push(...n):o(n),t.$$.on_mount=[]})),a.forEach(y)}(c,s.target,s.anchor),v()}var _,x;d(m)}function A(e){let n,o,r,c,f,d,p;return{c(){n=u("main"),o=u("h1"),r=a("Hello "),c=a(e[0]),f=a("!"),d=a(" "),p=u("p"),p.innerHTML='Visit the <a href="https://svelte.dev/tutorial">Svelte tutorial</a> to learn how to build Svelte apps.',l(o,"class","svelte-1tky8bj"),l(n,"class","svelte-1tky8bj")},m(t,e){!function(t,e,n){t.insertBefore(e,n||null)}(t,n,e),s(n,o),s(o,r),s(o,c),s(o,f),s(n,d),s(n,p)},p(t,[e]){1&e&&function(t,e){e=""+e,t.wholeText!==e&&(t.data=e)}(c,t[0])},i:t,o:t,d(t){t&&i(n)}}}function S(t,e,n){let{name:o}=e;return t.$$set=t=>{"name"in t&&n(0,o=t.name)},[o]}const T=new class extends class{$destroy(){!function(t,e){const n=t.$$;null!==n.fragment&&(o(n.on_destroy),n.fragment&&n.fragment.d(e),n.on_destroy=n.fragment=null,n.ctx=[])}(this,1),this.$destroy=t}$on(t,e){const n=this.$$.callbacks[t]||(this.$$.callbacks[t]=[]);return n.push(e),()=>{const t=n.indexOf(e);-1!==t&&n.splice(t,1)}}$set(t){var e;this.$$set&&(e=t,0!==Object.keys(e).length)&&(this.$$.skip_bound=!0,this.$$set(t),this.$$.skip_bound=!1)}}{constructor(t){super(),E(this,t,S,A,c,{name:0})}}({target:document.body});return document.body.innerHTML+='<script type="text/javascript" src="js/materialize.min.js"><\/script>\n<script type="text/javascript" src="js/main.js"><\/script>',T}();
//# sourceMappingURL=bundle.js.map
