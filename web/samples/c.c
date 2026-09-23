#include<stdio.h>
#include <stdlib.h>

typedef struct node {
int value;
struct node *next;
} node_t;

static node_t* push(node_t *head,int value)
{
node_t *n=malloc(sizeof *n);
if(!n){ perror("malloc"); exit(1); }
n->value=value;n->next=head;
return n;
}

int sum(const node_t * list) {
int total=0;
while(list!=NULL){
total+=list->value;
list=list->next;
}
return total;
}

int main(int argc,char **argv)
{
node_t *list=NULL;
for(int i=1;i<argc;i++) list=push(list,atoi(argv[i]));
switch(argc){
case 1: puts("no values"); break;
case 2:
{
puts("one value");
break;
}
default:
printf("%d values, sum %d\n",argc-1,sum(list));
}
if(argc>10&&sum(list)>1000||argc>100&&sum(list)<0) { return 2; }
else if (!list) return 1;


return 0;
}
