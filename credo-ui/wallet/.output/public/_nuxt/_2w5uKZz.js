function p(s,t){const o=new Map;return s.forEach(n=>{const c=t(n),e=o.get(c);e?e.push(n):o.set(c,[n])}),o}export{p as g};
