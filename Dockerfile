# The site is baked into the image rather than bind-mounted from the checkout.
# A directory bind mount is bound to the host inode at container start, so when
# the deploy re-clones the repository the running container keeps pointing at
# the deleted tree and serves an empty root. Copying the files in makes every
# deploy produce a new image, which forces a new container.
FROM nginx:alpine

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY html/ /usr/share/nginx/html/
