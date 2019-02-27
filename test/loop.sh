#/bin/bash

INIT_FILE=$1
shift

if [[ ! -f "$INIT_FILE" ]];then
	echo '$1 is not a file'
	exit 2
fi

OK_FILE=$INIT_FILE-ok.log

count=1
SRC_FILE=$INIT_FILE
ERR_FILE=$INIT_FILE-$count.log

# run one
echo "$SRC_FILE >> $OK_FILE 2>> $ERR_FILE"
./node_modules/.bin/domain-status --method whois --domain-file $INIT_FILE >> $OK_FILE 2>> $ERR_FILE

# loop
max=9
while [ $count -ne 0 ]; do
	let next_count=count+1
	if [ $next_count -gt $max ];then
		next_count=1
	fi
	SRC_FILE=$ERR_FILE
	if [ ! -f $SRC_FILE ];then
		echo break due to $SRC_FILE is not a file
		break
	fi
	src_line_count=`wc -l < $SRC_FILE`
	if [ $src_line_count -eq 0 ];then
		echo break due to $SRC_FILE is empty
		break
	fi
	ERR_FILE=$INIT_FILE-$next_count.log
	if [ -f $ERR_FILE ];then
		echo rm $ERR_FILE
		rm $ERR_FILE
	fi
	echo "$SRC_FILE >> $OK_FILE 2>> $ERR_FILE"
	./node_modules/.bin/domain-status --method whois --domain-file $SRC_FILE >> $OK_FILE 2>> $ERR_FILE
	count=$next_count
done
