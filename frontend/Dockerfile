FROM nginx:alpine

RUN rm /etc/nginx/conf.d/default.conf

COPY ./nginx/nginx.conf /etc/nginx/nginx.conf

COPY ./frontend /usr/share/nginx/html

RUN cp /usr/share/nginx/html/pages/*.html /usr/share/nginx/html/ 2>/dev/null || true

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
